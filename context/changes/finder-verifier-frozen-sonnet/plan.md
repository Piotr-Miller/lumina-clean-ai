# Sealed verifier on frozen findings, stage 2 (sonnet-5) — Implementation Plan

## Overview

Run stage 1's experiment again (`finder-verifier-frozen`) with one property changed: the verifier model. Everything
else stays as sealed: verifier code, corpus, arms, criteria, request shape. The model becomes
`anthropic/claude-sonnet-5` @ `anthropic`.

- **Question:** does a stronger judge keep the true findings and refute the code-contradicted ones, where luna
  confirmed G-D13 and G-D14 despite delivered counterevidence?
- **Why a new change:** the model and slug are pinned and cannot change by amendment (`research.md` §2), and the
  owner decided stage 2 is a new, separately pre-registered change (decision 4.7).
- **Effect on production:** none.

## Current State Analysis

- **The code under test** is unchanged: tag `finder-verification/seal` = `9c85aa2`, `packages/code-reviewer/src`
  tree `9be94235…`.
  - Its verifier is model-neutral. Model and routing are passed in by the harness. `reasoning: {enabled: false}`,
    `max_tokens` 16,384 and the 120 s timeout are hard-coded in sealed code (`research.md` §2).
  - It runs from a worktree that today lives in another session's scratchpad
    (`/tmp/claude-1000/…/789990f8-…/scratchpad/fv-seal`). At planning it is intact (HEAD `9c85aa2`, src tree
    `9be94235…`) but disposable.
- **The instrument is stage 1's harness**, `context/archive/2026-10-09-finder-verifier-frozen/harness.mjs` (Amendment-1
  version, sha256 `ea7a3977…`).
  - At planning, its self-test passes 72/72 from the archive location against that worktree.
  - It is luna-specific in one constant (`:68`), two `"OpenAI"` provider checks (`:497`, `:507`), `CAP_HARD = 1.0`
    (`:374`), the self-test/dry-run stubs, and its usage comment.
  - It cannot run in place: the series must sit beside the harness, which would write into `context/archive/`
    (`:831-835`).
- **Budget at $2 / $10 per M** (live, 2026-10-10T21:35:26Z):
  - The sealed admission reserve P is $1.068–1.164 per attempt, above $1.00 for all 114 attempts.
  - The request-gate bound is $0.20–0.25 per request.
  - Expected spend for the series is about $1.7–2.7. The last recorded credit was about $5.39 (`research.md` §1).
- **Reasoning:** sonnet-5 has `mandatory: false` but `default_enabled: true` (adaptive, `high`).
  - OpenRouter documents that `enabled: false` is accepted on Sonnet 5. No local record shows a response with it
    off.
  - `reasoning.encrypted` is dropped by `@openrouter/ai-sdk-provider@3.0.0` and is invisible to every stage-1
    reasoning check (`research.md` §4).
- **Provider identity on the wire:** `ChatResult` documents no top-level `provider`. Stage 1 read one from OpenAI
  responses, and every sonnet finder step recorded `Anthropic` through the SDK. Whether the raw chat response carries
  it for Anthropic is unverified (`research.md` §5).
- **Owner decisions** (`change.md` § Owner decisions):
  1. Budget variant (a): keep the sealed P, raise the cap to about $3.9 stop-and-ask and $4.5 hard.
  2. A paid probe request goes before the series.

### Carried from predecessor

| Item                                                                                                                 | Source (path + finding)                                                                                              | Disposition                                                                                                               | Addressed in                       |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Carry-forward summary                                                                                                | `context/archive/2026-10-09-finder-verifier-frozen/plan.md` § Carried from predecessor: "none — no Predecessor line" | resolved (nothing to carry)                                                                                               | —                                  |
| Manual 1.8: failure output says what happened, which attempt, what to do next                                        | `…/finder-verifier-frozen/plan.md` Progress 1.8 `[ ]`; `reviews/impl-review-e0d2d19.md` (pending)                    | resolved: owner confirmed 2026-10-10 (`change.md` § Notes); the successor inherits the messages                           | Phase 1 (messages unchanged)       |
| Manual 4.7: stage-2 decision                                                                                         | `…/finder-verifier-frozen/plan.md` Progress 4.7; `change.md:117`                                                     | resolved: sonnet as a new change                                                                                          | this change                        |
| F1–F4 (violation latch, report detail, refutation scoring, fsync)                                                    | `…/reviews/impl-review-phase-1-edc0a83.md` F1–F4, closed by Re-review 1 (`Closes: F1, F2, F3, F4`)                   | resolved (FIXED); the regression cases live in the self-test this plan inherits                                           | Phase 1 (self-test must keep them) |
| `t0At` is the header's creation time, not the T0 read time; "a future harness should carry the read time explicitly" | `…/finder-verifier-frozen/gate.md:403-407`; `reviews/impl-review-e0d2d19.md:126`                                     | carried forward                                                                                                           | Phase 1 §2                         |
| Headroom (0.281 prompt, 0.112 cost) is "observed checks of A1–A3, not a general provider guarantee"                  | `reviews/impl-review-e0d2d19.md:82`                                                                                  | carried forward                                                                                                           | Phase 2 probe; Phase 3 A2 wording  |
| Wording: "confirmed six times each despite delivered counterevidence" over "a step away"                             | `reviews/impl-review-e0d2d19.md:108`; `gate.md:395-402`                                                              | carried forward                                                                                                           | Phase 5 results wording            |
| F2 (Anthropic pin in `createReviewer`), F4 (`sonnet-gate.mjs` runner gaps)                                           | `context/archive/2026-10-09-finder-failure-scenario/change.md:66-69`                                                 | superseded for this change: the sealed verifier path never calls `createReviewer` or `sonnet-gate.mjs` (`research.md` §6) | What We're NOT Doing               |

## Definitions

**Inherited verbatim.** Every row of `context/archive/2026-10-09-finder-verifier-frozen/gate.md` §6 (`plan.md`
§ Definitions there) is carried into this change's pre-registration **unchanged**, with two exceptions:

- the rows below that change or are new;
- the degenerate walk.

The inherited rows are Batch, Repeat, Survives publication, Refutes, Hard pass, Failed attempt, Error precedence,
Interrupted attempt, Cost-incomplete, T, P, E, Class, Arm O, True-class diagnosis and Compound finding. Their origin
is `user` (decisions 2–11 of the predecessor) and the owner's "same criteria" (`change.md` § Notes).

| Term                    | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Origin                                                                                            | On degenerate data                                                                                                                                                                                                                                                    | Verified by                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Verifier model**      | `anthropic/claude-sonnet-5` @ `anthropic`, routing `{order: ["anthropic"], only: ["anthropic"], allow_fallbacks: true, require_parameters: true}`, the sealed shape with only the slug changed                                                                                                                                                                                                                                                                                                                                                                      | user (decision 4.7)                                                                               | A request served by `claude-on-aws`, Bedrock, Vertex or Azure is a condition violation (below), even though the model and the price are the same                                                                                                                      | self-test, condition-violation group; probe (Phase 2)  |
| **Condition violation** | As inherited, with **`Anthropic`** in place of `OpenAI`, and **one channel added**: a non-empty `reasoning_details` array on the wire (any type, `reasoning.encrypted` / `reasoning.summary` / `reasoning.text` included) is reasoning, like the three inherited channels. A **missing** `usage.completion_tokens_details.reasoning_tokens` is recorded as `absent`, not as 0, and is not by itself a violation.                                                                                                                                                    | user (inherited rule; decision 4.7); plan (the fourth channel closes the gap in `research.md` §4) | Response with `reasoning: null`, `reasoning_tokens` absent, `reasoning_details: [{type:"reasoning.encrypted", data:"…"}]` → violation, stop. Response with provider `OpenAI` → violation.                                                                             | self-test, condition-violation group (new cases)       |
| **Request gate, A1–A3** | Formula and enforcement inherited. Restated for Claude: **(A1)** the messages tokenize to at most b tokens (no byte-per-token guarantee is published for Claude's tokenizer; observed about 2.2 bytes per token on diff text, `research.md` §3); **(A2)** the overhead the provider adds is at most 32 tokens per message plus 32. Anthropic documents no per-message overhead and 0 tool tokens without tools; this is an **assumption with no published guarantee**; **(A3)** billed prices are at most 1.10 × the pre-flight prices                              | plan (inherited formula; wording from `research.md` §3)                                           | The probe's reported `prompt_tokens` above b + 32·m + 32 → the series is not sealed until the owner decides                                                                                                                                                           | probe (Phase 2); self-test, budget group               |
| **Cap**                 | Inherited enforcement. Values: `CAP_HARD` = **$4.50**; the series runs with `--cap 3.90` (stop and ask). Admission (T + P ≤ cap) therefore admits attempts while T ≤ about $2.74 at `--cap 3.90`. A resume past that needs an owner decision and a new invocation with a cap ≤ $4.50, which admits while T ≤ about $3.34                                                                                                                                                                                                                                            | user (owner decision 1); plan (the exact values)                                                  | Credit below $5.10 (probe limit $0.60 + `CAP_HARD` $4.50) before the probe → stop and ask. Credit below $4.50 (the series maximum) at the series pre-flight → stop and ask before T0; the probe's spend, already gone from the balance, is not added again            | self-test, budget group (realistic prices); pre-flight |
| **Probe**               | One verifier attempt on a **synthetic, non-corpus** batch, sent through the new harness's gated fetch at sonnet-5 prices, **before the seal**, with its own hard limit of $0.60 covering every request of the attempt, retry and repair included. The Request gate admits each request when T so far + its bound ≤ $0.60: bounds are about $0.20 for a call and about $0.33 for a repair, so after a cheap first call a retry or a repair can still fit. Protection is conditional on A1–A3, as in the series. Its outcome is read against the checklist in Phase 2 | user (owner decision 2); plan (input, placement, limit)                                           | First call costs $0.02 and needs a repair → T 0.02 + repair bound about 0.33 ≤ 0.60 → sent. A transient error after that → T + the retry's bound is checked the same way: sent if it fits, otherwise `budget-stopped`, and the checklist is read on what was recorded | self-test, probe group; Phase 2                        |
| **E**                   | Inherited formula, reported only. Its 60-output-tokens-per-finding constant stays, and gate §10 carries the projection from stage 1's measured tokens at sonnet prices ($1.68) as the expected spend; the `report` mode is unchanged (owner decision 2026-10-11)                                                                                                                                                                                                                                                                                                    | plan                                                                                              | —                                                                                                                                                                                                                                                                     | gate §10                                               |

**Degenerate walk (stage 2):**

- Batch `openai-pr269-05`, base, repeat 2. The first answer is malformed. `reasoning_tokens` is absent and
  `reasoning_details` is empty. The repair returns valid JSON with an encrypted `reasoning_details` entry.
- **Result:** the latch fires on the repair response. No further send happens. The attempt is a condition violation,
  its cost counts, and the series stops. On resume (identical conditions), the slot gets one fresh attempt.
  Earlier lines stay. Every step is decided by the inherited rows plus the Condition violation row above.

## Desired End State

`context/changes/finder-verifier-frozen-sonnet/` holds:

- a harness of its own;
- a committed probe record;
- `gate.md` with a sealed pre-registration (hash, commit, pushed annotated tag `finder-verifier-frozen-sonnet/seal`),
  a ledger, the pre-flight, the series `series-sonnet.jsonl`, and Results in the same form as stage 1;
- a blinded hand-read of the code-refutable refutations;
- an information-only side-by-side with stage 1.

The owner records the next decision. Production is untouched.

### Key Discoveries:

- **Only the target and the accounting change.** The sealed `src` tree fixes the request shape. The harness fixes
  the model, slug, provider identity and money (`research.md` § Architecture Insights). So every pin except `model`,
  `slug` and `harness` is carried byte for byte. The harness's `plan` mode must reproduce the archived
  `harness-plan-check.json` exactly: excerpt serving is unchanged.
- **The probe must not see the corpus.** A probe on a corpus batch before the seal would show verdicts before the
  criteria are sealed. A synthetic batch tests the instrument (provider, reasoning, tier, A2), not the judgement.
- **Before the seal, the harness can still change freely.** If the probe shows the wire lacks a field the harness
  relies on, Phase 1 is reopened rather than amended. After the seal, only a hashed amendment can change it.
- **Lessons applied** (33 of 38 apply to `plan`):
  - ablate from the reproducing artifact: one property, the model, changes;
  - an offline result is not adoption evidence;
  - count attempts, not rows;
  - a check must say what it found;
  - a per-step output cap hit is `NoOutputGeneratedError`. With reasoning off, the largest stage-1 output was 590
    tokens against 16,384; adaptive thinking silently left on is what would hit it, and the reasoning channels stop
    the series first;
  - enumerate pointers before writing a fact (Phase 5).

## What We're NOT Doing

- **No change to the sealed code**, excerpt policy, prompt, `max_tokens`, quote rule, retry/repair, routing shape or
  `reasoning: {enabled: false}`. No `cache_control` (it would change the request).
- **No change to any criterion, class, rationale, compound list, corpus member or arm.** These are owner-sealed in
  stage 1 and carried verbatim.
- **No probe on corpus inputs** and no extra paid probe beyond Phase 2's one attempt without a new owner decision.
- **No port of the `finder-sonnet-effort` branch code.** F2 and F4 stay where they are; they do not reach this path.
- **No re-enabling of AI review** and no claim about it (predecessor decision 6).
- **No finder recall study, no other model, no sonnet-5.5** (`mandatory: true` there, so `enabled: false` returns
  400).
- **No edit to `context/archive/`.** The archived harness, gate and series stay byte-identical.

## Implementation Approach

1. **Phase 1, free:** copy the instrument and change only what the model forces. Prove it offline, with stage 1's
   72 cases plus the new ones.
2. **Phase 2, paid, about $0.02, at most $0.60:** one probe on a synthetic batch, before anything is sealed.
3. **Phase 3, free plus a push:** seal the pre-registration with the harness the probe validated.
4. **Phase 4, paid, expected $1.68:** pre-flight, then the 114-attempt series under the sealed budget. This is the
   stage-1 measured-token projection carried in gate §10; the planning estimate with token inflation is about
   $2.2 (`research.md`), within the unchanged $4.50 hard cap.
5. **Phase 5:** blinded hand-read, results, the side-by-side with stage 1, and the owner's next decision.

## Critical Implementation Details

- **Ordering:**
  - Phase 2 runs on the Phase 1 harness. Any harness change after the probe sends the plan back through Phase 1's
    criteria, and a second probe needs the owner's go-ahead.
  - The pre-registration pins the harness hash that the last probe ran on, or, if the harness changed after it,
    states the diff.
- **Credit before seal:** `CAP_HARD` sits inside the harness, so it is sealed with it. Read the credit (free
  authenticated `GET /api/v1/credits`) in Phase 2, **before** the probe and the seal. If it is below $5.10 (probe limit $0.60 + `CAP_HARD` $4.50),
  stop and ask. At the series pre-flight (Phase 4) re-read it against the series maximum alone: below $4.50 → stop
  and ask. The probe's spend has already left the balance and is not counted twice.

## Phase 1: The stage-2 instrument (free)

### Overview

Re-create the sealed worktree in a stable place, copy the archived harness into this change folder, and make the
minimal model-forced edits plus the reasoning channel, the T0 read time and the probe mode. Prove all of it offline.

### Changes Required:

#### 1. Stable sealed worktree

**File**: outside the repository, `~/.cache/finder-verifier-frozen-sonnet/fv-seal` (git worktree of `9c85aa2`, `npm ci`
in `packages/code-reviewer`)

**Intent**: Stop depending on another session's scratchpad. Pin the dependency install to the lockfile.

**Contract**:

- `git worktree add --detach <path> finder-verification/seal`;
- `npm ci` (never `npm install`);
- `@openrouter/ai-sdk-provider` 3.0.0 and `ai` 7.0.52, as in the sealed lockfile;
- the harness keeps refusing a wrong HEAD, a wrong src tree or a dirty src (`harness.mjs:74-82`).

#### 2. Harness copy and edits

**File**: `context/changes/finder-verifier-frozen-sonnet/harness.mjs` (copied from the archived Amendment-1 version)

**Intent**: The same instrument aimed at sonnet-5, with every stage-1 behaviour kept and the four gaps closed.

**Contract**:

- **Model-forced edits:**
  - `VERIFIER = { model: "anthropic/claude-sonnet-5", slug: "anthropic" }`;
  - both provider checks compare against `"Anthropic"`, derived from the sealed `ENDPOINT_NAMES[slug]`
    (`9c85aa2:packages/code-reviewer/scripts/finder-gate-core.mjs:38`) rather than a second literal;
  - `CAP_HARD = 4.5`;
  - the usage comment and paths point at this change folder.
- **Fourth reasoning channel:** in the fetch wrapper, a non-empty `message.reasoning_details` latches a violation
  (F1's latch), before the response returns to the SDK. A missing `reasoning_tokens` is recorded as `absent`.
- **T0 read time:**
  - a `--t0-at <iso>` flag is written to the header as `t0At`;
  - a resume with a different value is refused;
  - without the flag on the first invocation, the run is refused (the stage-1 caveat).
- **Probe mode:** `probe --series <path> --t0 <usd> --t0-at <iso> --cap <usd> --price-in <$/M> --price-out <$/M>`.
  - It sends one attempt on a `PROBE` batch built inside the harness: one finding against a block rendered by the
    sealed `renderRange` from a file at `9c85aa2` that is in neither corpus diff. Its content is part of the harness
    hash.
  - It goes through the same gated fetch, latch, journal (`start`/`request`/`end`/`counter`) and `describeRequest`
    telemetry.
  - It **skips the seal check and the admission reserve** (it runs before any seal, and P > $0.60), and keeps the
    Request gate.
  - It refuses `--cap` above $0.60.
  - It refuses a series path named `series-sonnet.jsonl`.
  - It prints the Phase 2 checklist with observed values. A field that is absent is printed as `absent`, never as 0.
- **Unchanged:** every other mode, rule, message and the scoring code.
- **Diffable:** the change is reviewed as `git diff --no-index <archived harness> <this harness>`.

#### 3. Self-test and dry-run updates

**File**: `context/changes/finder-verifier-frozen-sonnet/harness.mjs`

**Intent**: Keep every stage-1 case, aimed at the new provider, and cover each new rule.

**Contract**:

- The stubs report provider `Anthropic`. The Azure violation cases stay (Azure also serves sonnet). A case with
  provider `OpenAI` → violation.
- **New cases:**
  - `reasoning_details` with `reasoning.encrypted` only → violation, one send;
  - `reasoning.text` only → violation;
  - absent `reasoning_tokens` → recorded `absent`, not a violation;
  - the encrypted-on-repair degenerate walk above → violation after exactly two sends, then a fresh attempt on
    resume;
  - realistic prices ($2 / $10): P for every batch > $1.00 → refused at `--cap 1.0`, admitted at `--cap 3.90`;
  - `--cap 4.51` → refused;
  - `--t0-at` missing on a first run → refused, and different on resume → refused;
  - probe mode: `--cap 0.61` → refused, a `series-sonnet.jsonl` path → refused, the seal is not required, the
    checklist prints `absent` for a missing field; a cheap first call followed by a transient error → the
    retry is sent when T + its bound ≤ $0.60 and `budget-stopped` when it is not (one case each).
- The dry run asserts `body.model = "anthropic/claude-sonnet-5"`, the routing with `anthropic`,
  `reasoning: {enabled: false}`, `max_tokens` 16,384, 38 requests and `failures: []`.

### Success Criteria:

#### Automated Verification:

- The sealed worktree is intact at the stable path: `git -C ~/.cache/finder-verifier-frozen-sonnet/fv-seal rev-parse HEAD HEAD:packages/code-reviewer/src` prints `9c85aa2…` and `9be94235…` — not run: needs Phase 1 output (at planning the scratchpad copy passes: exit 0)
- The sealed package tests pass there: `npm test` in `<wt>/packages/code-reviewer` — not run: needs Phase 1 output
- The stage-1 self-test still passes from the archive as a baseline: `FV_OUT=<scratch>/ FV_PKG=<wt>/packages/code-reviewer npx --no-install tsx context/archive/2026-10-09-finder-verifier-frozen/harness.mjs self-test` — at planning: exit 0 (72/72)
- The new self-test passes every case, the 72 inherited ones included: `FV_OUT=<scratch>/ FV_PKG=<wt>/packages/code-reviewer npx --no-install tsx context/changes/finder-verifier-frozen-sonnet/harness.mjs self-test` — not run: needs Phase 1 output
- The dry run passes with the sonnet wire shape: `… context/changes/finder-verifier-frozen-sonnet/harness.mjs dry-run` — not run: needs Phase 1 output
- Excerpt serving is unchanged: `… harness.mjs plan` to scratch, Prettier-formatted, byte-identical to `context/archive/2026-10-09-finder-verifier-frozen/harness-plan-check.json` — not run: needs Phase 1 output
- Mutants fail: (a) the `reasoning_details` check removed, (b) the provider check left at `"OpenAI"`, (c) the probe's `--cap` limit removed, each on a scratch copy → self-test exit 1 — not run: needs Phase 1 output
- The archive is untouched: `git diff --exit-code -- context/archive/` — at planning: exit 0
- The change folder is formatted: `npx --no-install prettier --check context/changes/finder-verifier-frozen-sonnet` — at planning: exit 0

#### Manual Verification:

- The owner reads the probe checklist output on a stubbed run and agrees that it says what was observed, what is absent, and what to do next

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated verification passes, then asks the human about these; a pending manual check is reported, not a blocker for the next phase.

---

## Phase 2: Probe and pre-seal pre-flight (paid, about $0.02, at most $0.60; owner authorization)

### Overview

Read prices, endpoints, credit and the key counter, then send the one probe attempt. Record what the wire actually
carries for sonnet-5 @ `anthropic` before anything is sealed.

### Changes Required:

#### 1. Probe record

**File**: `context/changes/finder-verifier-frozen-sonnet/probe.md` and `probe.jsonl`

**Intent**: Evidence that the instrument's assumptions hold on the real endpoint, committed before the seal so that
the pre-registration can cite it by hash.

**Contract**: `probe.md` records:

- **Reads**, each with its UTC time and route:
  - `GET /api/v1/models/anthropic/claude-sonnet-5/endpoints` (price, `provider_name`, tags, `supported_parameters`,
    any tier variant);
  - `GET /api/v1/models` (the `reasoning` block, any deprecation or `expiration_date`);
  - `GET /api/v1/credits`;
  - `GET /api/v1/key` (T0 for the probe);
  - after the probe, `GET /api/v1/generation?id=<id>` (`provider_name`, `service_tier`, native token counts).
- **The checklist**, observed against expected:
  1. HTTP 200 and served by `Anthropic`: the wire `provider`, the SDK `providerMetadata`, and the generation record.
     Each is printed, with `absent` where missing.
  2. No reasoning on any of the four channels. `reasoning_tokens` is 0 or `absent`; which one is stated.
  3. `prompt_tokens` ≤ b + 32·m + 32, with the ratio (A1/A2 headroom).
  4. Cost ≤ bound (A3), and the ratio.
  5. `service_tier` value or `absent`.
  6. The sealed parser accepted the answer, or the repair path ran (information).
  7. Spend: T = max(counter Δ, recorded) ≤ the probe's `--cap` (owner decision 2026-10-11, review F3). The end
     counter read is journaled even when it fails; a failed read leaves the spend unverified (re-review 2, F5).
  8. The generation record of every successful response was read (HTTP 200 with a JSON body). A failed or
     skipped read is reported with its status as "could not see", never as absent fields (owner decision
     2026-10-11, review F2; a 2xx body that is not JSON counts as not read, re-review 2, F5).
- **Outcome rules, fixed here before the probe runs:**
  - all of 1–4 hold → Phase 3;
  - **1 fails only because the wire field is absent**, while the generation record says `Anthropic` → Phase 1 is
    reopened to read the provider from the generation record. A second probe needs the owner;
  - **2 fails** (any reasoning) → stop. Stage 2 as specified cannot run, and the owner decides;
  - **3 or 4 fails** → stop and ask. A1–A3 are broken for this endpoint;
  - the credit is below $5.10 → stop and ask before the probe;
  - **(owner decision 2026-10-11, review F1–F3)** also never PROCEED on: an account error (401/402) on any
    request → stop and ask; any other condition violation that items 1–4 do not explain → stop and ask; item 7
    failing → stop and ask (reconcile the counter and the recorded cost); the end counter unread → undetermined
    (re-read it, free, and decide with the owner; re-review 2, F5); item 8 failing → undetermined (re-read the
    record, free, and decide with the owner). A plain format failure or `budget-stopped` is information only.
  - **Precedence** (the first failing rule decides; every other failing rule is printed after it): account → reasoning
    (2) → no successful response → provider (1) → A1–A3 (3–4) → other condition violation → spend (7) → generation
    read (8) → PROCEED.

### Success Criteria:

#### Automated Verification:

- (paid) The probe runs and its journal is complete (start/request/end, counters): `… harness.mjs probe --series context/changes/finder-verifier-frozen-sonnet/probe.jsonl --t0 <T0> --t0-at <iso> --cap 0.60 --price-in 2 --price-out 10` — artifact: `probe.jsonl`, `probe.md` — not run: paid
- Probe spend ≤ $0.60 (max of counter delta and recorded) — not run: needs Phase 2 output
- The change folder is formatted — at planning: exit 0

#### Manual Verification:

- The owner authorizes the probe after reading the reads (price, credit)
- The owner reads the checklist and confirms the outcome rule that applies

---

## Phase 3: Pre-registration and seal (free; owner approval; push)

### Overview

Write `gate.md` for stage 2 from stage 1's sealed pre-registration, changing only what this plan names. Get it
approved, then hash, commit, tag and push it before any series call.

### Changes Required:

#### 1. The pre-registration

**File**: `context/changes/finder-verifier-frozen-sonnet/gate.md`

**Intent**: The same question, inputs, criteria and rules as stage 1, for sonnet-5, fixed before any corpus verdict
exists.

**Contract**: one section `## Pre-registration` … `_End of Pre-registration._`, built from
`context/archive/2026-10-09-finder-verifier-frozen/gate.md` §1–12:

- **Verbatim:** §5 classes, §6 inherited rows, §7 criteria with the hand-read rule and the three rationales, §8
  compound list, §9 blinding (new seed at Phase 5), §11 stop rules, §12 amendments.
- **Changed:**
  - §1: the question for sonnet-5, and stage 1's result as context;
  - §2: what a stage-2 result can show, including "it cannot fix evidence delivery" (decision 5);
  - §3: the `json pins` with `model`, `slug` and `harness` new and every other pin equal to stage 1's; the probe
    record's sha256;
  - §4: routing with `anthropic`, the series path `series-sonnet.jsonl`, `--cap 3.90`, `--t0-at`;
  - §6: the rows of this plan's Definitions;
  - §10: `CAP_HARD` $4.50 and stop-and-ask $3.90; E and the $1.68 projection; the stop conditions (price ≠ $2 / $10,
    `anthropic` endpoint missing, `reasoning` or `max_tokens` unsupported, a deprecation or `expiration_date` set,
    credit below the hard cap).
- **Added:** the stage-1 side-by-side as an information-only output, never a criterion.

#### 2. Seal record

**File**: `context/changes/finder-verifier-frozen-sonnet/gate.md`

**Intent**: Prove the pre-registration precedes every series call.

**Contract**: as stage 1 (`gate.md` § Pre-registration seal):

- the owner approval with date;
- the `sed … | sha256sum` hash, taken twice;
- the UTC time;
- the commit;
- GitHub's push time from the activity API;
- the annotated tag `finder-verifier-frozen-sonnet/seal`, pushed. The tag survives the rebase-merge SHA rewrite.

### Success Criteria:

#### Automated Verification:

- The section hashes reproducibly: the `sed … | sha256sum` twice — not run: needs Phase 3 output
- The harness accepts the seal and refuses an edited harness: a scratch `checkSeal` probe on the current and an edited copy, network sentinel 0 — not run: needs Phase 3 output
- Every non-model pin equals stage 1's: compare the two `json pins` blocks key by key, expecting differences in `model`, `slug`, `harness` only — not run: needs Phase 3 output
- The change folder is formatted — at planning: exit 0
- (paid) The seal commit and tag are on `origin`: `git push origin HEAD refs/tags/finder-verifier-frozen-sonnet/seal`, then `git ls-remote --tags origin 'finder-verifier-frozen-sonnet/*'` — artifact: `gate.md` § Pre-registration seal — not run: paid (external effect: push)

#### Manual Verification:

- The owner approves the pre-registration as written, before the hash is taken

---

## Phase 4: Paid series, stage 2 (owner authorization)

### Overview

Pre-flight against the sealed stop conditions, then 114 attempts (19 batches × 2 arms × 3 repeats) under the sealed
budget.

### Changes Required:

#### 1. Pre-flight and ledger

**File**: `context/changes/finder-verifier-frozen-sonnet/gate.md` § Results

**Intent**: Record, before T0, that nothing the seal assumed has moved.

**Contract**: as stage 1, plus:

- the credit read, against the series maximum: below $4.50 → stop and ask before T0 (the probe's spend is not
  added again);
- the endpoint list and the models entry (deprecation);
- T0 **with its read time**, passed as `--t0-at`.

The ledger has one row per invocation.

#### 2. The series

**File**: `context/changes/finder-verifier-frozen-sonnet/series-sonnet.jsonl`

**Intent**: The raw, append-only record of every attempt.

**Contract**: `harness.mjs run --series …/series-sonnet.jsonl --repeats 3 --t0 <T0> --t0-at <iso> --cap 3.90 --price-in 2 --price-out 10`.
A stop by admission past T ≈ $2.74 is the sealed stop-and-ask. A resume needs the owner and a cap ≤ $4.50.

### Success Criteria:

#### Automated Verification:

- (paid) Pre-flight reads: endpoints, models, credits, key — artifact: `gate.md` § Results › Pre-flight — not run: paid (external)
- (paid) The series completes or stops by a sealed rule: the `run` above — artifact: `series-sonnet.jsonl` — not run: paid
- The report reproduces from the committed series: `… harness.mjs report --series …/series-sonnet.jsonl` — not run: needs Phase 4 output
- Spend stays within the cap: T after ≤ $3.90 per invocation, never > $4.50 in total — not run: needs Phase 4 output

#### Manual Verification:

- The owner authorizes the series after reading the pre-flight
- Any condition violation or admission stop is decided by the owner

---

## Phase 5: Blinded hand-read, results and decision

### Overview

As stage 1 Phase 4. Then the side-by-side with stage 1, and the owner's next decision.

### Changes Required:

#### 1. Blind sheet, grades, results

**File**: `context/changes/finder-verifier-frozen-sonnet/hand-read/`, `gate.md` § Results

**Intent**: The same blinded grading and per-class verdicts as stage 1, so the two stages are comparable.

**Contract**:

- **Hand-read as stage 1:**
  - the seed is committed and pushed before `blind` runs;
  - `sheet.md` is committed;
  - `key.json` stays out of the repository (hash only) until the grades are in;
  - then `report --grades --key` is run.
- **Results:**
  - the three verdict lines;
  - the per-finding diagnosis;
  - the reviewer's wording for confirmed-despite-counterevidence cases;
  - **an information-only table, stage 1 vs stage 2 per true and code-refutable finding** (base hard result,
    O result, diagnosis).
- **The owner's next decision**, recorded in `change.md`.
- **Pointers enumerated before writing it:** `change.md`, `plan-brief.md` and any roadmap or issue mention found by
  grepping the old state ("stage 2", "pending").

### Success Criteria:

#### Automated Verification:

- The blind sheet carries no arm/repeat/run identifier: `grep -cE 'openai-pr269-|"arm"|"repeat"|blockIds' hand-read/sheet.md` returns 0 — not run: needs Phase 4 output
- The key matches its recorded hash — not run: needs Phase 5 output
- The graded report reproduces — not run: needs Phase 5 output
- The seal still reproduces after results are appended — not run: needs Phase 3 output
- The change folder is formatted — at planning: exit 0

#### Manual Verification:

- The owner grades every sheet entry against its pre-registered rationale
- The owner records the next decision in `change.md`

---

## Testing Strategy

### Unit Tests:

- The self-test (inherited 72 cases + the new groups), through the sealed code with `openRouterStub` and injected
  fetch/counter. Each changed or new Definitions row has a case.
- Three mutants (Phase 1) prove the new checks are not vacuous.

### Integration Tests:

- `dry-run`: the full 38-request path with the sonnet wire shape.
- `plan`: byte-identical excerpt serving against the archived check file.

### Manual Testing Steps:

1. Read a stubbed probe checklist before the real one.
2. Read the probe record and the pre-flight before authorizing each spend.
3. Grade the blind sheet.

## Performance Considerations

114 sequential requests with a 120 s timeout each. Sonnet is slower than luna, so expect about 20–60 minutes of wall
time. There is no concurrency, matching the sealed one-request-per-review shape.

## Migration Notes

None. Nothing in `src/`, `packages/` or CI changes. The archive stays untouched.

## References

- Research: `context/changes/finder-verifier-frozen-sonnet/research.md`
- Owner decisions: `context/changes/finder-verifier-frozen-sonnet/change.md`
- Predecessor: `context/archive/2026-10-09-finder-verifier-frozen/` (`plan.md`, `gate.md`, `harness.mjs`,
  `harness-plan-check.json`, `reviews/`)
- Corpus: `context/archive/2026-10-09-finder-failure-scenario/phase0-findings.json`
- Refutation rationales: `context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:22,26,31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The stage-2 instrument (free)

#### Automated

- [x] 1.1 The sealed worktree is intact at the stable path — 3f96b05
- [x] 1.2 The sealed package tests pass there — 3f96b05
- [x] 1.3 The stage-1 self-test still passes from the archive as a baseline — 3f96b05
- [x] 1.4 The new self-test passes every case, the 72 inherited ones included — 3f96b05
- [x] 1.5 The dry run passes with the sonnet wire shape — 3f96b05
- [x] 1.6 Excerpt serving is unchanged — 3f96b05
- [x] 1.7 Mutants fail — 3f96b05
- [x] 1.8 The archive is untouched — 3f96b05
- [x] 1.9 The change folder is formatted — 3f96b05

#### Manual

- [x] 1.10 The owner reads the probe checklist output on a stubbed run and agrees that it says what was observed, what is absent, and what to do next

### Phase 2: Probe and pre-seal pre-flight (paid, about $0.02, at most $0.60; owner authorization)

#### Automated

- [x] 2.1 (paid) The probe runs and its journal is complete
- [x] 2.2 Probe spend ≤ $0.60
- [x] 2.3 The change folder is formatted

#### Manual

- [x] 2.4 The owner authorizes the probe after reading the reads
- [ ] 2.5 The owner reads the checklist and confirms the outcome rule that applies

### Phase 3: Pre-registration and seal (free; owner approval; push)

#### Automated

- [ ] 3.1 The section hashes reproducibly
- [ ] 3.2 The harness accepts the seal and refuses an edited harness
- [ ] 3.3 Every non-model pin equals stage 1's
- [ ] 3.4 The change folder is formatted
- [ ] 3.5 (paid) The seal commit and tag are on `origin`

#### Manual

- [ ] 3.6 The owner approves the pre-registration as written, before the hash is taken

### Phase 4: Paid series, stage 2 (owner authorization)

#### Automated

- [ ] 4.1 (paid) Pre-flight reads
- [ ] 4.2 (paid) The series completes or stops by a sealed rule
- [ ] 4.3 The report reproduces from the committed series
- [ ] 4.4 Spend stays within the cap

#### Manual

- [ ] 4.5 The owner authorizes the series after reading the pre-flight
- [ ] 4.6 Any condition violation or admission stop is decided by the owner

### Phase 5: Blinded hand-read, results and decision

#### Automated

- [ ] 5.1 The blind sheet carries no arm/repeat/run identifier
- [ ] 5.2 The key matches its recorded hash
- [ ] 5.3 The graded report reproduces
- [ ] 5.4 The seal still reproduces after results are appended
- [ ] 5.5 The change folder is formatted

#### Manual

- [ ] 5.6 The owner grades every sheet entry against its pre-registered rationale
- [ ] 5.7 The owner records the next decision in `change.md`
