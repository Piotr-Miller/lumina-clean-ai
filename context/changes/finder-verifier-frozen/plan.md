# Sealed verifier on frozen findings — Implementation Plan

## Overview

Measure the verifier of `finder-verification`, unchanged and exactly as sealed, on 75 frozen code-review findings
whose truth the owner has already classified. The question is whether it keeps true findings, including D2, the
one real #269 defect, and refutes findings that the code contradicts.

- **Stage 1:** `openai/gpt-6-luna` only. Two arms (production excerpts, and the same plus frozen evidence lines),
  3 repeats each over the 19 original batches.
- **Pre-registration:** sealed and pushed before any paid call.
- **Effect on production:** none. The result can show whether the verifier is useful; it cannot by itself
  justify re-enabling AI review (owner decision 6).

## Current State Analysis

- **The code under test** exists only at the pushed tag `finder-verification/seal` (`9c85aa2`).
  - Its `packages/code-reviewer/src` is tree `9be94235…` and is byte-identical to `origin/feat/finder-verification`.
  - In a scratch worktree it reproduces the six sealed hashes and passes 1,086/1,086 package tests
    (`research.md` § Follow-up).
  - `master` has no verifier, and `ai-review` is off there (`.github/workflows/review.yml:29`, `false &&`).
- **The instrument exists**: `context/changes/finder-verifier-frozen/harness.mjs`, with two free modes.
  - **`plan`**: excerpt serving per finding for both arms. For the 38 G findings it equals the sealed
    `backcheck-269-policy.json`, with 0 mismatches.
  - **`dry-run`**: runs the real `createVerifier` with the package's `openRouterStub`. That covers 38 requests,
    the checked wire shape, every publication branch and 0 failures.
  - Neither mode calls the network.
- **The verifier's behaviour** (code, at the seal):
  - It sends one request per review, with all findings and all blocks (`src/pipeline.ts:870-885`).
  - Each finding gets one verdict over its whole `description`.
  - Only `confirmed` with a quote that passes the check is published (`src/verifier.ts:307-386`).
  - There is no `temperature` and no `seed` (`src/verifier.ts:166-175`), so repeats are independent provider
    draws.
  - The output cap is 16,384 tokens per step, while the largest batch holds 6 findings, so a `finish=length`
    cutoff is not a realistic risk.
  - A format failure after its one repair throws `VerifierOutputError`. A timeout, 429 or 5xx is retried once
    (`src/retry.ts:33-37`).
- **Evidence serving in base** (`harness-plan-check.json`):
  - D2's 8 members receive 14/30 evidence lines (×7) and 22/30 (×1).
  - The 3 code-refutable findings receive 100%.
  - H-R1 25/25, H-R3 5/5, H-R5 2/4.
  - Arm O serves every listed line.
- **Owner decisions 1–8** are in `change.md`: route A, whole-finding verification, per-class scoring, arm O, luna
  first, gate unchanged, frozen evidence lines, final classes. This planning session added decisions 9–12 (Key
  Discoveries below).

### Carried from predecessor

none — no Predecessor line

_(For the record, outside the template:_

- _this change implements the next experiment named in_
  _`context/archive/2026-10-09-finder-failure-scenario/phase0.md` § Owner decision;_
- _F-b (`context/archive/2026-10-03-finder-verification/follow-ups/successor.md`) is handled by owner decision 2_
  _(verify whole, flag compound findings);_
- _F-a (finder recall variance) does not apply to frozen findings.)_

## Definitions

| Term                                    | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Origin                                                                                                                        | On degenerate data                                                                                                                                                                                                    | Verified by                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Batch**                               | One original finder run/attempt's findings (19 batches), passed through `mergeFindings` → `assignFindingIds` as production does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | user (decision 5)                                                                                                             | No member may collapse: the harness throws if two members map to one id (none do today)                                                                                                                               | `harness.mjs plan` (Phase 1 §1)                    |
| **Repeat**                              | One independent verifier request per batch per arm; 3 repeats; order interleaved r1 (all batches, base then O), r2, r3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | user (3 repeats); plan (the order)                                                                                            | A batch with nothing sendable makes no request and records `no-request`; none exists in this corpus                                                                                                                   | self-test (Phase 1 §3)                             |
| **Survives publication**                | The finding is in `published` returned by the sealed `applyVerdicts`: `confirmed` **and** a quote that passes the sealed check (≥ 10 non-whitespace chars, exact or whitespace-collapsed substring of one of its own blocks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | user (decision 3), sealed rule                                                                                                | `confirmed` with a 9-char quote → `unverifiable: quote-not-in-excerpt` → not survived; `unsupported` → not survived; a failed attempt → not survived                                                                  | self-test cases S1–S4 (Phase 1 §3)                 |
| **Refutes** (code-refutable class)      | `refuted` **and** a quote that passes the sealed check **and** an argument that, with the quote, actually refutes the frozen claim, judged in a blinded owner hand-read against the rationale pre-registered for that row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | user (decision 10)                                                                                                            | `refuted` with an empty quote → "refuted without evidence", not a pass; a verified quote with an off-target argument → "off-target refutation", not a pass; the two are reported separately from the automatic result | self-test S5–S6; hand-read (Phase 4)               |
| **Hard pass, per finding**              | The class criterion holds in **3/3** base repeats. A **2/3 majority** view is reported alongside as information (owner: the review is advisory)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | user (decision 9)                                                                                                             | 2/3 → "unstable", hard fail; a repeat lost to a failed attempt counts as not meeting the criterion                                                                                                                    | `harness.mjs report` on a stub series (Phase 1 §3) |
| **Failed attempt** (model-attributable) | Classified by the sealed `isModelAttributableError` (`scripts/finder-gate-core.mjs:447`), after the precedence rule below. It covers: an API error with an HTTP status other than 401/402 (429 and 5xx after the sealed retry; e.g. 400 at once); a timeout after the retry; `VerifierOutputError`, which is a format failure after its repair, **or** a first answer that does **not parse** and ended `finish=length` (no repair, cause `length`). **A first answer that parses is accepted even when it ended `finish=length`** (`src/verifier.ts:189-191`): it is scored normally, with `length` noted on the attempt. **Plan extension:** `AI_NoOutputGeneratedError` is a failed attempt with cause `no-output` and its recorded `finishReason`. The name alone does not prove a cap hit, since the SDK has other causes (source given by the reviewer: ai-sdk.dev, `AI_NoOutputGeneratedError`), so the cause chain is recorded and never relabelled. Every finding of that batch in that repeat fails its criterion; **no extra draw**; the cause is reported as an execution failure, never as judgement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | user (decision 11); plan (`no-output`, endorsed in review as a conservative scoring rule)                                     | Parseable JSON + `length` → scored, flagged. Unparseable + `length` → failed, `length`                                                                                                                                | self-test, failed-attempt group                    |
| **Condition violation**                 | Any request whose `provider_name` is **missing** or ≠ `OpenAI`; reasoning on **any** of the three channels the sealed gate reads (`describeRequest` / `reasoningTokensOf`, `finder-gate-core.mjs:377-415`): SDK reasoning tokens > 0, OpenRouter `completionTokensDetails.reasoningTokens` > 0, or reasoning text longer than 0; 401/402; an error with no HTTP status that is not model output (connection failure, runner `TypeError`, reader I/O); a hash mismatch; an interrupted attempt. The series **stops**; every attempt and its cost is kept; resume only with identical frozen code, inputs and config, otherwise a new series. Nothing is deleted **On resume the violated slot gets one fresh attempt** (owner decision 2026-10-10): the violated attempt stays in the file and the report, its cost counts toward T, and it is never scored as a model result. This differs from a failed attempt, which gets no extra draw, and from an interrupted attempt (the process died, no `end` line), which is never re-sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user (decision 11)                                                                                                            | A provider swap at attempt 40 → stop; attempts 1–39 stay in the file and the report                                                                                                                                   | self-test, condition-violation group               |
| **Error precedence**                    | The first matching class wins: (1) a harness precondition (hash, corpus, `--t0`, unmatched `start`); (2) an account error, 401/402 on the error **or its cause**; (3) a violation visible in the recorded steps (provider missing or wrong, reasoning on any channel, a reported request cost above its bound), even when the attempt then errored; (4) model-attributable per the sealed classifier; (5) `AI_NoOutputGeneratedError` → `no-output`; (6) anything else → measurement error, a condition violation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | user (review: keep account and harness errors first); plan (the order)                                                        | `AI_NoOutputGeneratedError` whose cause is a 402 → class (2), stop, not `no-output`. A 5xx after a step that reported provider `Azure` → class (3), stop                                                              | self-test, precedence group                        |
| **Interrupted attempt**                 | A `start` line with no matching `end`: the process died between preparing or sending a paid request and recording its outcome. `--resume` **refuses** while one exists. The owner reconciles it with `reconcile --key <k>`, which appends an `interrupted` line, sends nothing, and leaves the slot **never re-sent**. It scores as not met for its batch and repeat, cause `interrupted`, reported as an execution failure. **Its cost is max(P, Σ bounds of its `request` lines)**. Every request is preceded by a durable `request` line carrying its bound (Request gate), so that sum is a proven upper bound. The key counter is **never** used to lower it: equal reads prove nothing about settlement (review; OpenRouter key API docs give no settlement guarantee)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | user (review: keep P unless billing data confirms the full cost); plan (Σ request bounds, which is never below the true cost) | Recorded $0.70; the interrupted call cost $0.04 and two counter reads both show $0.70 → charged max(P, its request bound) ≈ $0.047, never 0                                                                           | self-test, durability group                        |
| **Cost-incomplete**                     | An attempt with any request that reports no cost, including every request of a call that timed out. Each unreported request is charged **its own bound** from the Request gate; reported requests keep their reported cost. The attempt is flagged and reported as an execution failure. It is not a stop and not a quality failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | plan (as the sealed gate's G4b treats timeouts)                                                                               | A success whose repair step reports no cost → the repair is charged its bound                                                                                                                                         | self-test, cost group                              |
| **T (spend so far)**                    | T = max(C − T0, Σ costs recorded in the series). C is the key counter (`GET /api/v1/key` `usage`), read by the harness at each invocation's start and end and written as `counter` lines; it can only **raise** T. **T0 is written into the series header on the first invocation** with its read time, and a resume with a different `--t0` is refused. A request's cost is its reported cost, or its bound when unreported; an interrupted attempt's cost is per its row. T advances after **every request**, not just every attempt. Recorded spend is counted once, never subtracted from the cap as well                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | user (review points 1–2); memory (the counter lags, so the max governs)                                                       | Resume with 0.30 recorded and the counter still at 0.12 → T = 0.30. Resume with `--t0` ≠ the header → refused                                                                                                         | self-test, budget group                            |
| **P (attempt admission reserve)**       | The worst case for a whole attempt, used **only to decide whether to start one**, so that an attempt is not routinely cut by the Request gate: P = 1.10 × 2 × [(B + 256)·p_in + 16,384·p_out + (B_r + 256)·p_in + 16,384·p_out]. B is the UTF-8 byte length of the serialized call messages; B_r = 3,000 + 4 × 16,384 bytes allows for the repair re-sending an output of up to 16,384 tokens with escaping and a variable validation message (measured overhead: 1,788–2,828 bytes, review). **P is not the proof of the cap; the Request gate is.** Measured: about $0.053–0.058 per attempt (computed from the dry run's measured message sizes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | plan (review point 2)                                                                                                         | A 1-finding batch still reserves the full 16,384-token output on every request                                                                                                                                        | self-test, budget group                            |
| **Request gate** (the hard bound)       | Before **every** request — call, repair, retried call, retried repair — the harness's `fetch` wrapper, passed through the sealed `VerifierOptions.fetch` seam, reads the outgoing body. That seam forwards the body byte-identically. The wrapper computes the request's bound: bound = 1.10 × [(b + 32·m + 32)·p_in + max_tokens·p_out], where b is the UTF-8 byte length of the serialized `messages`, m the number of messages, and `max_tokens` the body's own value (16,384 on every sealed request). **The bound is conditional, not proven.** It holds under three stated assumptions: **(A1)** the text of the messages tokenizes to at most b tokens (a byte-level BPE token never covers less than one byte); **(A2)** the template overhead the provider adds is at most 32 tokens per message plus 32. This is an **assumption with no published guarantee** for `openai/gpt-6-luna` @ `openai`: OpenAI's cookbook calls per-message overhead model-dependent and approximate (source given by the reviewer). Typical text runs about 3.5 bytes per token, so (A1) normally leaves thousands of tokens of slack that would absorb a larger overhead, but that is evidence, not proof; **(A3)** billed prices are at most 1.10 × the pre-flight prices. It writes a durable `request` line `{kind:"request", key, n, bytes, maxTokens, bound}`, then sends only if **T + bound ≤ `--cap`**. Otherwise it sends nothing, records `budget-stopped` for the attempt (scored as not met, cause `budget`, never re-sent) and stops the series. A body without `max_tokens` cannot be bounded, so it is refused as a condition violation. **After** each request, a reported `prompt_tokens` above b + 32·m + 32, or a reported cost above the bound, is a condition violation: an assumption broke. **This detects the breach; it does not prevent that request's cost.** The largest unprevented excess is one request's real cost above its bound, after which the series stops. The report gives the observed headroom, max(prompt_tokens ÷ (b + 32·m + 32)) over all requests | plan (review point 2)                                                                                                         | T = 0.79 and the repair's bound is $0.0166 (its maximum; a call's is $0.0124) → the repair is not sent; the attempt is `budget-stopped` and the series stops at T ≤ $0.80                                             | self-test, budget group                            |
| **E (expected attempt cost)**           | The earlier estimate, kept for projection and reporting only, never for the cap: chars ÷ 3.5 input tokens and 60 output tokens per finding sent. Measured: $0.0263 per repeat of both arms, **$0.079 for all 114 attempts**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | plan                                                                                                                          | —                                                                                                                                                                                                                     | report (Phase 3)                                   |
| **Cap**                                 | The cap is enforced in two places. The **Request gate** enforces it **under assumptions A1–A3** (Request gate row): every request is admitted only when T + its bound ≤ `--cap`. A broken assumption is detected after the request and stops the series, but that one request's excess is not prevented. The **admission** of each attempt (T + P ≤ `--cap`) only avoids starting attempts that the gate would cut. `--cap` is required, has no default and must be ≤ $1.00 (hard). Phase 3 passes $0.80, the stop-and-ask line. **Feasibility:** admission binds only once T > about $0.742; at the expected $0.079 all 114 attempts run. Were every request to hit every limit, the gate would stop the series before $0.80, provided A1–A3 hold. Spending past $0.80 needs an owner decision and a new invocation with a higher cap, still ≤ $1.00                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user (decision 12; review points 1–2)                                                                                         | T = 0.75, P = 0.058 → the attempt is not started; T, P and the cap are printed                                                                                                                                        | self-test, budget group                            |
| **Class**                               | True: G-D2 (8), H-R1, H-R3, H-R5. Code-refutable: G-D13, G-D14, G-D20. Policy: G-D4–D10, G-D16, G-D18, G-D19, H-R2. Ambiguous: G-D1, G-D3, G-D11, G-D12, G-D15, G-D17, H-R4. Descriptive: all 32 set-E findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | user (decision 8)                                                                                                             | G-D2's 8 members are 8 input variants of one defect, never 8 independent cases; G-D5 (3 members) is `no-locator` and is never sent                                                                                    | `CLASS` hash in the pre-registration (Phase 2)     |
| **Arm O**                               | Base plan unchanged, plus one block per contiguous run of the finding's frozen evidence lines that its own blocks lack (G: archived EVID; H: owner-corrected lines). Diagnostic only; never a production-policy success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | user (decisions 4, 7)                                                                                                         | "All lines served" ≠ all evidence (Pillow, ROI data, experiments, file lists are not lines); E rows get no extra blocks (O = base)                                                                                    | `harness.mjs plan` (Phase 1 §1)                    |
| **True-class diagnosis**                | Per finding, the **first** rule that matches wins: (1) base 3/3 and O 3/3 → `survives`; (2) base 3/3 and O < 3/3 → `survives, O anomaly`; (3) base < 3/3 and **every** base miss is a failed or interrupted attempt → `lost to reliability`; (4) base < 3/3 and O 3/3 → `evidence-delivery limit`; (5) otherwise → `investigate`, listing the base states (`unsupported`, `refuted`, `quote-not-in-excerpt`, `no-verdict`, failed attempt). The labels are mutually exclusive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | user (decision 4); plan (the order; the review asked for exclusive precedence)                                                | Base: published, published, timeout → the only miss is a failure → rule (3), `lost to reliability`, whatever O shows. Base: published, unsupported, timeout; O 3/3 → rule (4), `evidence-delivery limit`              | self-test, scoring group                           |
| **Compound finding**                    | A finding whose `description` makes two or more separately checkable claims. Flagged in the report, never split. The list is proposed by the agent and approved by the owner before the seal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | user (decision 2); list approval in Phase 2                                                                                   | H-R4 (false JPEG + true short-PNG), G-D13 (unreachable `ValueError` + silent empty index), G-D14 (enlargement + aspect distortion) are known members                                                                  | owner approval (Phase 2 manual)                    |

**Degenerate walk (the one this ledger was checked against):**

- D2 member 4.2, base: r1 `published`, r2 `unsupported`, r3 a timeout after retry.
- Its O repeats all publish.
- **Result:** hard fail, 1/3 (majority view fails too). The diagnosis is `evidence-delivery limit`, and the
  report notes that r3 was lost to reliability. Every step is decided by the table above.

## Desired End State

**`gate.md` in this folder** holds three things, the first sealed:

1. a sealed pre-registration, its sha256 recorded, tagged `finder-verifier-frozen/seal` and pushed;
2. a ledger of every paid series;
3. a Results section.

**The Results section states**, per finding and per repeat, for both arms:

- the record state, quote match, reason and failure cause;
- **per class:**
  - the hard 3/3 verdict and the majority view;
  - for the code-refutable class, the automatic result and the blinded hand-read result side by side;
  - the true-class diagnosis per finding;
  - the policy, ambiguous and descriptive distributions, reported only;
- reliability, kept apart from judgement quality;
- the spend against the $1.00 cap.

**The owner then records a stage-2 decision** (sonnet or stop). Production is untouched throughout.

### Key Discoveries:

- **The seam is clean.** The sealed `runVerificationPass` runs on frozen findings unchanged
  (`research.md` § Follow-up, dry run).
- **Arm O cannot reuse it whole.** It must reproduce `runVerificationPass` step 3 (`createVerifier` →
  `withOneRetry(verify)` → `applyVerdicts`) on the augmented plan, because `planExcerpts` is called inside the
  pass (`src/pipeline.ts:798`). The harness already does this. In the paid mode it must also thread
  `onStepEnd`/telemetry through the same `asStepProvider`/`asStepCost` helpers the pass uses
  (`src/pipeline.ts:822-850`), so both arms are measured identically.
- **Owner decisions of this session:**
  - 9: 3/3 per finding, majority reported as information;
  - 10: refuted = check + blinded hand-read under pre-registered rationales;
  - 11: the failure taxonomy above, keep every attempt;
  - 12: budget $1.00 hard, stop and ask at $0.80.
- **The refutation rationales already exist** in `context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:22,26,31`
  and are owner-confirmed (D13 and D20 checked by the owner in code). Phase 2 copies them verbatim.
- **Prior lessons that shape this plan** (`context/foundation/lessons.md`):
  - count attempts, not successful rows (guard-metric lesson);
  - a model grader or hand-read needs its rule fixed before the result is seen (regex-grader lesson);
  - an offline eval is not adoption evidence (offline-eval lesson);
  - print state, subject and way out, never silence (check-that-cannot-say lesson);
  - `finish=length` is not retried (per-step cap lesson).

## What We're NOT Doing

- **No sonnet run.** That is stage 2, and only on a separate owner decision after stage 1 (decision 5).
- **No change to the sealed code**, its excerpt policy, prompt, limits or quote rule. No port and no merge of
  `feat/finder-verification`.
- **No hand-splitting of compound findings** (decision 2). They are flagged, not split.
- **No change to the sealed "zero owner-rejected" gate** (decision 6), and no claim that AI review may be
  re-enabled.
- **No hard criterion for the policy, ambiguous or descriptive classes.** No mandatory `confirmed` for policy
  rows, especially missing-tests claims (decision 8).
- **No owner classification of set E** in this change.
- **No re-draw after a failed attempt.** No deletion of attempts after a condition violation (decision 11).
- **No D2-detection (finder recall) study.** That is separate by the owner's direction.

## Implementation Approach

**Free first, paid last, sealed in between:**

1. Phase 1 finishes the instrument and proves every scoring and failure rule on stubbed series. That needs no
   network.
2. Phase 2 freezes everything the result depends on (code, corpus, evidence, classes, rationales, compound list,
   harness) under one hash and a pushed tag, with the owner's approval.
3. Phase 3 spends: live pre-flight, then the interleaved series under the budget rule.
4. Phase 4 runs the blinded hand-read and writes the results. The owner decides stage 2.

## Critical Implementation Details

- **Ordering.** The harness's own sha256 is part of the sealed inputs. Phase 1 must be complete before Phase 2
  hashes anything, and the paid mode refuses to start if `harness.mjs` differs from the sealed hash, the same way
  it already refuses a changed `src` tree.
- **State sequencing.** The series file is append-only and holds a `start` line before every request and an `end`
  line after it, each `fsync`ed. A resume recomputes T from the file, refuses on any pinned-hash difference or
  unmatched `start`, and never rewrites a line. The cap is a total, so recorded spend is counted once.
- **Blinding.** The sheet must not be generated before the series is complete, and its key must not be readable
  in the session that grades it. The key is written to scratch and only its sha256 is committed until the owner
  hands in the grades.

## Phase 1: Finish the instrument (free)

### Overview

Add the paid run, the report and the blinded-sheet modes to `harness.mjs`, and a `self-test` mode that drives
every scoring and failure rule through the real sealed code with a stubbed HTTP client.

### Changes Required:

#### 1. Paid run mode

**File**: `context/changes/finder-verifier-frozen/harness.mjs`

**Intent**: Run the frozen batches against the real OpenRouter endpoint and record everything needed to score and
audit each attempt. Both arms go through the same telemetry path.

**Contract**:

- **Invocation:** `harness.mjs run --series <path> --repeats 3 --t0 <usd> --cap <usd> [--resume]`, plus
  `harness.mjs reconcile --series <path> --key <attempt-key> --cost <usd|P>` for an interrupted attempt.
- **Refusals:** missing `OPENROUTER_API_KEY`, a series path outside this change folder, `--cap` absent or above
  $1.00, `--t0` absent, any start line without an end line (unless reconciled), any pinned hash differing from the
  header.
- **Pinned hashes:** besides the `src` tree, it pins `scripts/finder-gate-core.mjs`
  (`e713226c…bcb17`), whose `describeRequest`, `reasoningTokensOf` and `isModelAttributableError` it reuses.
- **Line 1 is a header:** the seal commit, the `src` tree, the gate-core sha256, the corpus sha256, both diff
  sha256s, the `harness.mjs` sha256, the EVID/CLASS/COMPOUND/RATIONALE sha256s, model, slug, repeats, the
  pre-flight prices, and **T0 with its read time**. A resume must pass the same `--t0` or omit it.
- **`counter` lines** `{kind:"counter", usage, at}` are written at each invocation's start and end, and at
  `reconcile`.
- **Two lines per attempt.** Each is written and `fsync`ed before the code moves on.
  - **`start`**, written **before** any request is sent: `{kind:"start", key, repeat, run, arm, P, at}`.
  - **`end`**: `{kind:"end", key, latencyMs, status, failureClass?, cause?, cost, costComplete,
requests[describeRequest(...) + timedOut], rawText, records[{member, id, state, reasonCode, modelVerdict,
quote, quoteVerified, quoteMatch, reason, blockIds}]}`.
  - The key is `r<repeat>/<run>/<arm>`.
  - **`request`** lines (Request gate) precede every send within the attempt.
  - `reconcile` appends `{kind:"interrupted", key, cost: max(P, Σ request bounds), basis}` and never sends a
    request.
- **Telemetry, both arms:** every step of every request (call, repair, retried call) goes through the sealed
  `describeRequest`, by chaining `onStepEnd` (base: `createVerifier` injected into `runVerificationPass`; O: the
  same factory). The two arms therefore record identically.
- **Order:** for r in 1..3, for batch in corpus order, base then O.
- **Failure classes** (Definitions): `failed-attempt` records its cause and the series continues;
  `condition-violation` stops with a message naming the attempt key, what was observed and how to resume.
- **Budget:**
  - Admission: before each attempt, compute T and P (Definitions). If T + P > `--cap`, do not start; print T, P
    and the cap.
  - **Request gate:** a `fetch` wrapper, passed through the sealed `createVerifier({fetch})` seam in both arms,
    bounds every outgoing body. It writes and `fsync`s the `request` line, then sends only within the cap.
    Afterwards it checks the reported `prompt_tokens` and cost against the bound.
  - E is printed beside the actual cost, for information.
- **Output:** one line per attempt (key, status, cost, T), and a summary at the end.

#### 2. Report and blind modes

**File**: `context/changes/finder-verifier-frozen/harness.mjs`

**Intent**: Turn a series into the pre-registered tables, and produce the blinded hand-read sheet for the
code-refutable refutations.

**Contract**:

- **`report --series <path> [--grades <path>]`** prints Markdown and a JSON summary. It writes no file unless
  `--out` is given. Its tables:
  - per finding × repeat × arm;
  - per class, the 3/3 verdict and the majority view;
  - the true-class diagnosis;
  - reliability: attempts, failed attempts by cause, violations;
  - spend by telemetry.
- **`blind --series <path> --seed <hex> --out <dir>`** collects every `refuted` record of G-D13, G-D14 and G-D20,
  in both arms and all repeats. It writes:
  - `sheet.md` (blind labels `R01…`; claim, pre-registered rationale, quote, reason; no arm, repeat or run);
  - `key.json` (label → arm, repeat, member);
  - the sha256 of each.
- **`report --grades`** joins the owner's grades (`pass` / `off-target` / `no-evidence` per label) through the key.

#### 3. Self-test mode

**File**: `context/changes/finder-verifier-frozen/harness.mjs`

**Intent**: Prove every Definitions row on canned provider answers through the sealed code, before any spend.

**Contract**: `self-test` exits 0 only when every case holds. **The cases follow from coverage, not from a count:**
each Definitions row and each failure class has at least one case, and a new rule adds a case. Groups:

- **Publication:** a valid quote → published; a 9-character quote → `quote-not-in-excerpt`; `unsupported` → not
  survived; a whitespace-collapsed match → published, `quoteMatch: "whitespace"`; a sent finding with no verdict →
  `no-verdict`; two verdicts for one id → `duplicate-verdict`.
- **Refutation:** `refuted` with an empty quote → "refuted without evidence"; `refuted` with a quote absent from
  its blocks → "refuted without evidence"; `refuted` with a valid quote → automatic pass, pending the hand-read.
- **Failed attempt:** malformed output twice → `VerifierOutputError`; unparseable first answer with
  `finish=length` → no repair, cause `length`; **parseable** first answer with `finish=length` → scored normally,
  `length` noted; `AI_NoOutputGeneratedError` → cause `no-output`, cause chain recorded; two 5xx → exactly one retry, then failed; a timeout on both
  tries → failed, cause `timeout`, cost-incomplete; HTTP 400 → failed at once. Each fails every finding of the
  batch for that repeat and sends no extra request.
- **Condition violation:** provider `Azure`; provider missing; SDK reasoning tokens > 0; OpenRouter reasoning
  tokens > 0 alone; reasoning text alone; 401; 402; a connection error with no status; an injected runner
  `TypeError`. Each stops the series and keeps every earlier line.
- **Precedence:** `AI_NoOutputGeneratedError` with a 402 cause → account violation; a 5xx after a step with
  provider `Azure` → violation, not a failed attempt; a reported request cost above its bound → violation.
- **Cost:** a success with one unreported request cost → that request is charged **its own bound**, flagged, and the series continues.
- **Budget:**
  - T + P > cap → the attempt is not started (the stub sees no request);
  - a resume with 0.30 recorded and a stale counter → T = 0.30, counted once;
  - recorded 0.795 with cap 0.80 → refused;
  - `--cap 1.01` → refused;
  - a resume with a `--t0` different from the header → refused;
  - the reserve P for a 1-finding batch uses the full 16,384-token output bound;
  - the Request gate blocks a repair whose bound would pass the cap: the stub sees only the first request, and the
    attempt is `budget-stopped` and never re-sent;
  - the gate's bound grows with the actual repair body (a first answer carrying 1,000 closing delimiters);
  - reported `prompt_tokens` above the bound → violation; a reported cost above the bound → violation;
  - a body without `max_tokens` → refused, nothing sent.
- **Durability:**
  - a process killed after `start` and before `end` → resume refused;
  - `reconcile` → cost = max(P, Σ bounds of the slot's `request` lines), whatever the counter shows (two equal
    counter reads below the true cost must not lower it); an `interrupted` line is appended and no request is
    sent;
  - resume then continues with the next slot, and the slot scores as a failure, cause `interrupted`.
- **Resume integrity:** a changed corpus hash, a changed `harness.mjs` hash and a changed gate-core hash → each
  refused.
- **Scoring:**
  - a 2/3 series → `unstable`, hard fail, majority pass;
  - one case per diagnosis rule (1)–(5), including a finding matching both the old "survives" and "anomaly"
    readings, which must land on rule (2) only.
- **Blind:** the sheet contains no value from `key.json` (arm, repeat, run, member).

It prints one line per case: group, case, expected, observed.

### Success Criteria:

#### Automated Verification:

- The sealed worktree is intact: `git -C <wt> rev-parse HEAD:packages/code-reviewer/src` equals `9be94235…` — at planning: exit 0
- The sealed package tests pass in the worktree: `npm test` in `<wt>/packages/code-reviewer` — at planning: exit 0 (1,086 passed, run during research)
- The dry run still passes: `FV_OUT=<scratch> FV_PKG=<wt>/packages/code-reviewer npx tsx context/changes/finder-verifier-frozen/harness.mjs dry-run` — at planning: exit 0
- The self-test passes every case (coverage per Definitions row and failure class): `… harness.mjs self-test` — at planning: exit 1 — expected until Phase 1 (mode not implemented: `usage: harness.mjs plan|dry-run`)
- The report renders from the self-test's stub series: `… harness.mjs report --series <scratch>/stub-series.jsonl` — at planning: exit 1 — expected until Phase 1 (mode not implemented)
- The plan mode output is unchanged: `… harness.mjs plan` then `git diff --exit-code -- context/changes/finder-verifier-frozen/harness-plan-check.json` — not run: writes (it rewrites the tracked-to-be JSON)
- The change folder is formatted: `npx prettier --check context/changes/finder-verifier-frozen` — at planning: exit 0

#### Manual Verification:

- The owner reads one self-test case output per failure class and agrees it says what happened, which attempt, and what to do next

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated verification passes, then asks the human about these; a pending manual check is reported, not a blocker for the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Pre-registration and seal (free; owner approval)

### Overview

Write `gate.md` with everything the result depends on, get the owner's approval, then hash, commit, tag and push
it before any paid call.

### Changes Required:

#### 1. The pre-registration

**File**: `context/changes/finder-verifier-frozen/gate.md`

**Intent**: Fix the question, the inputs, the scoring and the stop rules before any verdict exists.

**Contract**: one section `## Pre-registration` … `_End of Pre-registration._`, containing:

- **The question**, plus decision 6's limit on what it can show.
- **Frozen inputs with sha256:**
  - the seal commit and src tree;
  - `phase0-findings.json` `46aaa0f2…0740`;
  - both diffs;
  - `harness.mjs`;
  - the EVID, CLASS, COMPOUND and RATIONALE objects, hashed as canonical JSON.
- **The arms**, and the request shape, which is the sealed one: luna @ `openai`, `reasoning: {enabled: false}`,
  `require_parameters: true`, no `response_format`, 120 s, one transient retry, one format repair.
- **The Definitions table above, verbatim**, and the degenerate walk.
- **Per-class criteria:**
  - true: survives 3/3 base;
  - code-refutable: refutes 3/3 base, automatic and hand-read reported separately;
  - all others: reported only;
  - the majority view as information.
- **The three refutation rationales, verbatim** from `hand-read-269-presort.md:22,26,31`, with the hand-read
  rule: "Sukces wymaga refuted, cytatu przechodzącego zapieczętowany quote check oraz argumentu, który wraz z
  cytatem rzeczywiście obala zamrożoną tezę. Hand-read stosuje wcześniej zapisane uzasadnienia. Nietrafiony
  argument i brak poprawnego cytatu są raportowane osobno."
- **The compound-finding list**: the agent's proposal over all 75 findings, owner-approved.
- **The failure taxonomy and the resume rule.**
- **Budget:** $1.00 hard, stop and ask at $0.80; the T, P, Request gate, E and Cap definitions, verbatim,
  **including assumptions A1–A3 and the statement that the cap is conditional on them**; the feasibility
  statement (expected $0.079; admission binds only past T ≈ $0.742).
- **Durability:** the start/end protocol and the interrupted-attempt rule.
- **The blinding procedure and seed rule:** 32 bytes from `/dev/urandom`, written to `gate.md` before `blind`
  runs.
- **What a result can and cannot show.**

#### 2. Seal record

**File**: `context/changes/finder-verifier-frozen/gate.md`

**Intent**: Make the pre-registration provably earlier than every paid call.

**Contract**: `## Pre-registration seal`, outside the hashed section, records:

- the owner approval with date;
- the sha256 computed as `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`;
- the UTC time;
- the commit;
- GitHub's push time from the activity API;
- the annotated tag `finder-verifier-frozen/seal`, pushed. The tag survives the rebase-merge SHA rewrite.

The seal is never recomputed.

### Success Criteria:

#### Automated Verification:

- The pre-registration section exists and hashes reproducibly: the `sed … | sha256sum` above, run twice — not run: needs Phase 2 output
- The paid mode refuses a `harness.mjs` that differs from the sealed hash: `… harness.mjs run --series <scratch>/probe.jsonl --t0 0 --cap 0` on a deliberately edited copy — not run: needs Phase 1 output
- The change folder is formatted: `npx prettier --check context/changes/finder-verifier-frozen` — at planning: exit 0
- (paid) The seal commit and the tag are on `origin`: `git push origin HEAD refs/tags/finder-verifier-frozen/seal`, then `git ls-remote --tags origin 'finder-verifier-frozen/*'` — artifact: `gate.md` § Pre-registration seal — not run: paid (external effect: push)

#### Manual Verification:

- The owner approves the compound-finding list
- The owner approves the pre-registration as written, before the hash is taken

---

## Phase 3: Paid measurement, stage 1 (owner authorization)

### Overview

A live pre-flight, then 114 attempts (19 batches × 2 arms × 3 repeats) under the budget rule.

### Changes Required:

#### 1. Pre-flight and ledger

**File**: `context/changes/finder-verifier-frozen/gate.md`

**Intent**: Record, before T0, that nothing the seal assumed has moved.

**Contract**: `## Results` → `### Pre-flight` records:

- the seal check: the hash reproduces;
- the code and input hashes, by the harness itself;
- the endpoint list `GET /api/v1/models/openai/gpt-6-luna/endpoints`, with `provider_name`, price and `reasoning`
  support (a price or parameter change → stop and ask);
- T0 from `GET /api/v1/key`, and the credit total.

`### Ledger` keeps one row per invocation: start time, P of the next attempt, T before, `--cap`, the counter after, telemetry,
T after and the result.

#### 2. The series

**File**: `context/changes/finder-verifier-frozen/series-luna.jsonl`

**Intent**: The raw, append-only record of every attempt.

**Contract**: as Phase 1 §1, invoked with `--t0 <T0 from the pre-flight> --cap 0.80`. The cap is the total for the change, not a remainder: T already contains everything recorded.

**Size note:** the file is `*.jsonl`, which the review diff recipe already excludes, so committing it does not
blind a review.

### Success Criteria:

#### Automated Verification:

- (paid) Pre-flight reads prices and the key counter: `GET /api/v1/models/openai/gpt-6-luna/endpoints`, `GET /api/v1/key` — artifact: `gate.md` § Results › Pre-flight — not run: paid (external)
- (paid) The series completes or stops by a pre-registered rule: `… harness.mjs run --series context/changes/finder-verifier-frozen/series-luna.jsonl --repeats 3 --t0 <T0> --cap 0.80` — artifact: `series-luna.jsonl` — not run: paid
- The report reproduces from the committed series: `… harness.mjs report --series context/changes/finder-verifier-frozen/series-luna.jsonl` — not run: needs Phase 3 output
- Spend stays within the cap: ledger T after ≤ $0.80, never > $1.00 — not run: needs Phase 3 output

#### Manual Verification:

- The owner authorizes the paid series after reading the pre-flight
- Any condition violation is decided by the owner (resume under identical conditions, or a new series)

---

## Phase 4: Blinded hand-read, results and decision

### Overview

Grade the code-refutable refutations blind, write the results against the pre-registration, and record the
owner's stage-2 decision.

### Changes Required:

#### 1. Blind sheet and grades

**File**: `context/changes/finder-verifier-frozen/hand-read/`

**Intent**: Grade each refutation's argument without knowing which arm or repeat produced it.

**Contract**:

- The seed goes into `gate.md` first.
- Then `blind` writes `sheet.md` (committed) and `key.json` (kept in scratch; only its sha256 is committed).
- The owner fills `grades.json`.
- After that, `key.json` is committed and its sha256 checked against the recorded one.

#### 2. Results

**File**: `context/changes/finder-verifier-frozen/gate.md`

**Intent**: State the outcome per class exactly as pre-registered, without editing the pre-registration.

**Contract**: `## Results` holds the `report --grades` output and three verdict lines:

- true class: 3/3 count, and per-finding diagnosis;
- code-refutable: automatic and hand-read;
- reliability.

Below them sit the information-only distributions, then the owner's stage-2 decision, with date.

### Success Criteria:

#### Automated Verification:

- The blind sheet carries no arm, repeat or run identifier: `grep -cE 'openai-pr269-|"arm"|"repeat"|blockIds' hand-read/sheet.md` returns 0 (plain words like "base" may legitimately occur in quoted code, so they are not grepped; S15 checks the sheet against every key value) — not run: needs Phase 3 output
- The key matches its recorded hash: `sha256sum hand-read/key.json` — not run: needs Phase 4 output
- The graded report reproduces: `… harness.mjs report --series series-luna.jsonl --grades hand-read/grades.json` — not run: needs Phase 4 output
- The seal still reproduces after results are appended: the Phase 2 `sed … | sha256sum` — not run: needs Phase 2 output
- The change folder is formatted: `npx prettier --check context/changes/finder-verifier-frozen` — at planning: exit 0

#### Manual Verification:

- The owner grades every sheet entry against its pre-registered rationale
- The owner records the stage-2 decision (sonnet or stop) in `change.md`

---

## Testing Strategy

### Unit Tests:

- The self-test cases S1–S15 (Phase 1 §3) run through the sealed code with `openRouterStub`. Each Definitions
  row maps to at least one case.
- `harness.mjs plan` against the archived `backcheck-269-policy.json` (0 of 38 mismatches) stays the regression
  check for the excerpt plan.

### Integration Tests:

- `harness.mjs dry-run`: the full 38-request path, with the wire shape asserted.

### Manual Testing Steps:

1. Read one self-test output per failure class: is it understandable without the code?
2. Read the pre-flight before authorizing the spend.
3. Grade the blind sheet.

## Performance Considerations

114 sequential requests of at most about 31k characters each, with a 120 s timeout each. Expect roughly 10–25
minutes of wall time. There is no concurrency, matching the sealed one-request-per-review shape.

## Migration Notes

None. Nothing in `src/`, `packages/` or CI changes.

## References

- Research: `context/changes/finder-verifier-frozen/research.md` (incl. § Follow-up Research)
- Owner decisions: `context/changes/finder-verifier-frozen/change.md`
- Instrument: `context/changes/finder-verifier-frozen/harness.mjs`, `harness-plan-check.json`
- Sealed predecessor gate: `context/archive/2026-10-03-finder-verification/gate.md`
- Corpus: `context/archive/2026-10-09-finder-failure-scenario/phase0.md`, `phase0-findings.json`
- Refutation rationales: `context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:22,26,31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Finish the instrument (free)

#### Automated

- [x] 1.1 The sealed worktree is intact — edc0a83
- [x] 1.2 The sealed package tests pass in the worktree — edc0a83
- [x] 1.3 The dry run still passes — edc0a83
- [x] 1.4 The self-test passes every case — edc0a83
- [x] 1.5 The report renders from the self-test's stub series — edc0a83
- [x] 1.6 The plan mode output is unchanged — edc0a83
- [x] 1.7 The change folder is formatted — edc0a83

#### Manual

- [ ] 1.8 The owner reads one self-test case output per failure class and agrees it says what happened, which attempt, and what to do next

### Phase 2: Pre-registration and seal (free; owner approval)

#### Automated

- [x] 2.1 The pre-registration section exists and hashes reproducibly — 6e38ce8
- [x] 2.2 The paid mode refuses a `harness.mjs` that differs from the sealed hash — 6e38ce8
- [x] 2.3 The change folder is formatted — 6e38ce8
- [x] 2.4 (paid) The seal commit and the tag are on `origin` — 6e38ce8

#### Manual

- [x] 2.5 The owner approves the compound-finding list
- [x] 2.6 The owner approves the pre-registration as written, before the hash is taken

### Phase 3: Paid measurement, stage 1 (owner authorization)

#### Automated

- [x] 3.1 (paid) Pre-flight reads prices and the key counter
- [x] 3.2 (paid) The series completes or stops by a pre-registered rule
- [x] 3.3 The report reproduces from the committed series
- [x] 3.4 Spend stays within the cap

#### Manual

- [x] 3.5 The owner authorizes the paid series after reading the pre-flight
- [-] 3.6 Any condition violation is decided by the owner — n/a: no condition violation occurred (series-luna.jsonl: 114/114 attempts `ok`, gate.md § Results › Ledger)

### Phase 4: Blinded hand-read, results and decision

#### Automated

- [ ] 4.1 The blind sheet carries no arm, repeat or run identifier
- [ ] 4.2 The key matches its recorded hash
- [ ] 4.3 The graded report reproduces
- [ ] 4.4 The seal still reproduces after results are appended
- [ ] 4.5 The change folder is formatted

#### Manual

- [ ] 4.6 The owner grades every sheet entry against its pre-registered rationale
- [ ] 4.7 The owner records the stage-2 decision in `change.md`
