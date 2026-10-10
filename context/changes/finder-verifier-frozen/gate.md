# finder-verifier-frozen — pre-registered gate

> Plan: `context/changes/finder-verifier-frozen/plan.md` (Phase 2 writes this file; Phase 3 measures against it;
> Phase 4 appends the results). Owner decisions: `change.md` § Owner decisions 1–12 and the 2026-10-10 note.
> Instrument: `harness.mjs`, reviewed APPROVED in `reviews/impl-review-phase-1-edc0a83.md` (Re-review 1).
>
> **Status of this file:** a draft until `## Pre-registration seal` records the owner's approval and the hash. The
> hashed section is everything from `## Pre-registration` to `_End of Pre-registration._`, computed as
> `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum`. It is never edited
> after the seal; a later protocol change goes into `## Amendments`.

## Pre-registration

### 1. Question

Does the verifier of `finder-verification`, unchanged and exactly as sealed, keep the true findings (D2 above all)
and refute the findings that the code contradicts, when it is given frozen, already-classified findings instead
of a live finder's output?

- Stage 1 only: `openai/gpt-6-luna` @ `openai`. A sonnet stage needs a separate owner decision (decision 5).
- The answer is reported per class. There is no single pass/fail number.

### 2. What this can and cannot show

- **It can show** whether, on these 75 findings, the sealed verifier:
  - keeps the true ones through publication;
  - refutes the code-contradicted ones for the right reason;
  - fails because evidence was not delivered (arm O) or because of its judgement.
- **It cannot show:**
  - finder recall, since D2 detection is a separate study;
  - behaviour on other PRs;
  - anything about sonnet;
  - that AI review may be re-enabled. The sealed "zero owner-rejected" gate of `finder-sonnet-effort` is unchanged
    and is not what this experiment tests (decision 6).
- **Limits:**
  - 3 code-refutable findings give 9 base observations;
  - G-D2's 8 members are input variants of one defect, not 8 independent cases;
  - an offline result is not adoption evidence;
  - arm O is diagnostic only and never counts as a success of the production policy;
  - the cost cap is conditional on assumptions A1–A3 (§6, Request gate).

### 3. Frozen inputs

- **Code under test:** the pushed tag `finder-verification/seal` = commit `9c85aa27f418c6d8cb669b1bedddbb333799fa02`.
  - `packages/code-reviewer/src` is tree `9be9423531d08ec932f82db7683e97d4da5ddf5c`.
  - `scripts/finder-gate-core.mjs` has sha256 `e713226c84ce35d7f29fd2644660e823a91645c653761ee8f33e9a5f784bcb17`.
  - It is used from a scratch worktree, with `npm ci` in its package.
- **Corpus:** `context/archive/2026-10-09-finder-failure-scenario/phase0-findings.json`, 75 findings in 19 batches,
  sha256 `46aaa0f2407bb08139d416cfde9c80d9fee69d5c42c73febc3635d0225830740`.
- **Diffs**, rebuilt by the recipe in `context/archive/2026-10-03-finder-verification/gate.md` § Inputs freeze, each
  read through the sealed `readDiffScoped` at its head:
  - #269 `3d0adc1…fca2778`, sha256 `1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f`;
  - #247 `d097949…dec09f8`, sha256 `21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1`.
- **Scoring inputs** inside `harness.mjs`, each pinned as the sha256 of its canonical JSON (sorted keys):
  - `EVID`: arm O's evidence lines (decision 7);
  - `CLASS` (decision 8);
  - `COMPOUND` (§8);
  - `RATIONALE` (§7).
- **`harness.mjs` itself** is pinned. `run` refuses unless this section is sealed and every pin below equals what
  the harness computes (`checkSeal`).

```json pins
{
  "sealCommit": "9c85aa27f418c6d8cb669b1bedddbb333799fa02",
  "srcTree": "9be9423531d08ec932f82db7683e97d4da5ddf5c",
  "gateCore": "e713226c84ce35d7f29fd2644660e823a91645c653761ee8f33e9a5f784bcb17",
  "corpus": "46aaa0f2407bb08139d416cfde9c80d9fee69d5c42c73febc3635d0225830740",
  "diffs": {
    "247": "21973af35cc39f60488935583a85baf894a6c1a9b51069d16de86e701b5dc2e1",
    "269": "1e4ec0882371989122f9e4254c93c4df1f51826a4f57dbfe04139175177e550f"
  },
  "evid": "330f6c0211407c2c54eb6e0c05aa510d758a992e8b36c301d5409edcbbaa1c47",
  "class": "45960b73a2dcf603f74b606e77760d84e0094c87d9cfd09580e2763c1e5d96b4",
  "compound": "42b33581fd024fe02913d6e250c5a914365c216accbc599fa1518392f15378bd",
  "rationale": "cfbd8ba7d11bbd99b27c7e84107dbdeccbf1c13c72b02cc4edff8700febac1b1",
  "model": "openai/gpt-6-luna",
  "slug": "openai",
  "harness": "5ab5086f000b44a49f1ffd0fa5b20562f4ed19760882cb6a9afbf38113b6906b"
}
```

### 4. Arms, request shape and order

- **Base:** the sealed `runVerificationPass`, unchanged, on each original batch (`mergeFindings` →
  `assignFindingIds`).
- **O:** the base plan unchanged, plus one block per contiguous run of the finding's frozen evidence lines that
  its own blocks lack, rendered byte-identically to `renderRange`. It goes through the same `createVerifier` →
  `withOneRetry(verify)` → `applyVerdicts`, with identical telemetry.
- **Request**, sealed:
  - `openai/gpt-6-luna`, routing `{order: ["openai"], only: ["openai"], allow_fallbacks: true, require_parameters: true}`;
  - `reasoning: {enabled: false}`, `max_tokens` 16,384, no `response_format`, no tools;
  - 120 s timeout, one transient retry (429/5xx/timeout), one format repair.
- **Order:** for r in 1..3, for each batch in corpus order, base then O. That is 19 × 2 × 3 = 114 attempts.
- **Invocation:** `harness.mjs run --series context/changes/finder-verifier-frozen/series-luna.jsonl --repeats 3
--t0 <T0> --cap 0.80 --price-in <$/M> --price-out <$/M>`.
  - T0 and the prices come from the Phase 3 pre-flight and are pinned in the series header.
  - A resume uses `--resume`, with the same values or none.

### 5. Corpus classes

The classes are those of decision 8 (`CLASS`):

| Class                       | Rows                                         | Findings                                   |
| --------------------------- | -------------------------------------------- | ------------------------------------------ |
| True                        | G-D2 (8 members), H-R1, H-R3, H-R5           | 11                                         |
| Code-refutable              | G-D13, G-D14, G-D20                          | 3                                          |
| Policy (reported only)      | G-D4–D10, G-D16, G-D18, G-D19, H-R2          | 15 (G-D5's 3 are `no-locator`, never sent) |
| Ambiguous (reported only)   | G-D1, G-D3, G-D11, G-D12, G-D15, G-D17, H-R4 | 14                                         |
| Descriptive (reported only) | all set-E rows                               | 32                                         |

### 6. Definitions (verbatim from `plan.md` § Definitions at the seal)

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

### 7. Criteria per class

- **True class:** each finding must **survive publication in 3/3 base repeats**. 2/3 is `unstable`, a hard
  fail; the majority view is reported as information.
  - Per finding, the diagnosis rules (1)–(5) of §6 apply, with base against O.
  - A repeat lost to a failed or interrupted attempt counts as not met; its cause is reported as execution.
- **Code-refutable class:** each finding must be **refuted in 3/3 base repeats**. A repeat counts only when all
  three hold:
  - the verdict is `refuted`;
  - the quote passes the sealed check;
  - the blinded hand-read grades it `pass`.

  The automatic result (the first two conditions) and the hand-read result are reported side by side.

  The hand-read applies this rule (owner decision 10), verbatim:

  > Sukces wymaga refuted, cytatu przechodzącego zapieczętowany quote check oraz argumentu, który wraz z cytatem
  > rzeczywiście obala zamrożoną tezę. Hand-read stosuje wcześniej zapisane uzasadnienia. Nietrafiony argument i
  > brak poprawnego cytatu są raportowane osobno.

  The rationales it applies, verbatim from
  `context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:22,26,31`:

  - **G-D13:** A requested id with no runs exits with "no runs found for …" before `build_photo` is called, so
    `min(sizes)` never sees an empty set; an empty default scan writes the index and prints "0 photo(s), 0
    run(s)" to stderr.
  - **G-D14:** The claim inverts the arithmetic: outputs smaller than the original make line 146 a downscale,
    the documented rule ("an output is never enlarged") is honoured at line 151, and every image on one sheet
    comes from the same photo, so the aspect ratios agree to rounding.
  - **G-D20:** `return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the
    enclosing function), so nothing parses the error body or polls; `main`'s `finally` runs the cleanup and the
    process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).

- **Policy, ambiguous, descriptive:** reported as distributions and per-finding detail, with no hard criterion.
  For policy rows, `confirmed` is not mandatory (decision 8).
- **Reliability** (attempts by status and cause, flags, headroom) is reported apart from judgement quality.

### 8. Compound findings (flagged, never split — decision 2)

These are findings whose description makes two or more separately checkable claims. They are flagged in every
report table. A testing claim joined to a claim that a defect exists counts as compound. A second claim that is
itself only about test coverage does not; G-D6 `openai-pr269-08#8.3` is the borderline case, left out on that
ground.

| Member                | Row       | The claims                                                                       |
| --------------------- | --------- | -------------------------------------------------------------------------------- |
| `openai-pr269-01#1.3` | G-D9      | missing baseline → uncaught exception; malformed values mislead                  |
| `openai-pr269-09#9.4` | G-D10     | malformed JSON escapes; missing entries cause unrelated errors                   |
| `openai-pr269-05#5.2` | G-D13     | unreachable `ValueError`; silent empty index                                     |
| `openai-pr269-09#9.1` | G-D14     | enlargement; aspect distortion                                                   |
| `247-r1#1`            | H-R2      | no key-shape check; no localhost check                                           |
| `247-r1#3`            | H-R4      | JPEG SOF past the range (false); any truncated header (true for a short PNG)     |
| `medium-247-r2#3`     | E-R247-09 | false negatives from stale files; false positives from reuse                     |
| `openai-pr269-05#5.4` | G-D7      | no tests for the empty cases; an uncaught exception (D13's rationale refutes it) |
| `openai-pr269-01#1.5` | G-D4      | no decoder tests; the orientation sizing defect (D1's claim)                     |
| `openai-pr269-07#7.4` | G-D5      | no tests; the cleanup path and empty/malformed regions have failure cases        |

### 9. Blinding and seed

The procedure runs only after the series is complete:

1. Write 32 bytes from `/dev/urandom`, as hex, into `## Results` of this file, and commit and push it.
2. Run `harness.mjs blind --series series-luna.jsonl --seed <hex> --out <scratch dir>`. The sheet lists every
   `refuted` record of G-D13, G-D14 and G-D20, in both arms and every repeat, ordered by
   `sha256(seed:slot:member)`. It shows no slot, member or run.
3. Commit the sheet. `key.json` stays in scratch and only its sha256 is recorded until the owner hands in
   `grades.json` (`pass` / `off-target` / `no-evidence` per label).
4. Commit `key.json` afterwards and check it against its recorded sha256.

### 10. Budget

- **Limits:** $1.00 hard; stop and ask at $0.80 (`--cap 0.80`).
- **Definitions** of T, P, Request gate, E and Cap are as in §6.
- **Expected spend:** E ≈ $0.079 for all 114 attempts. The admission reserve P binds only past T ≈ $0.742.
- **The cap is conditional** on assumptions A1–A3 of the Request gate. A broken assumption is detected after the
  request and stops the series; only that request's excess is unprevented.
- **T0 and credit** are read at the Phase 3 pre-flight (`GET /api/v1/key`, `GET /api/v1/credits`). Prices and
  `provider_name` come from `GET /api/v1/models/openai/gpt-6-luna/endpoints`.
- **Stop and ask** before T0 on any of: a price change from $0.10 / $0.50 per M, a lost parameter, or a missing
  `OpenAI` endpoint.

### 11. Stop rules

- **Condition violation:** the series stops. Every line is kept. It resumes only under identical conditions,
  and the violated slot gets one fresh attempt (owner decision 2026-10-10).
- **Interrupted attempt:** resume is refused until `reconcile`. The cost is max(P, Σ request bounds), and the slot
  is never re-sent.
- **Admission stop or request-gate stop at the cap:** the series stops. Continuing past $0.80 needs an owner
  decision and a new invocation with a cap of at most $1.00.
- **A harness defect** found in a record is a measurement error. The fix goes in as a dated, hashed amendment
  pushed before any re-run, and the re-run is a new series. The void series' spend still counts.

### 12. Amendments

A protocol change after the seal goes into `## Amendments`, placed after the seal. Each amendment is dated,
carries its own sha256, and is committed and pushed before the measurement it affects. A change to the model,
prompt, code, inputs or a criterion after a result has been seen needs a new pre-registered change.

_End of Pre-registration._

## Pre-registration seal

**Sealed 2026-10-10.** The owner approved the section as written, including the compound list of §8 (ten
members: the agent's seven, the owner's two additions G-D7 `openai-pr269-05#5.4` and G-D4 `openai-pr269-01#1.5`,
and the agent's G-D5 `openai-pr269-07#7.4`, with G-D6 `openai-pr269-08#8.3` left out on the stated ground). The hash
below was then taken and is never recomputed. Nothing in this record is part of the hashed section.

- Owner approval: approved by the owner (date: 2026-10-10). Edits before the seal: the three compound additions above,
  made on the owner's review of the first draft (same date).
- sha256 of `## Pre-registration` … `_End of Pre-registration._`: **`c26476825dd06a6daf0c5904591ba48ec493810ca02a197a3bb92f1938a8adaa`**, computed as
  `sed -n '/^## Pre-registration$/,/^_End of Pre-registration\._$/p' gate.md | sha256sum` (reproduced twice).
- UTC time taken: **2026-10-10T15:28:07Z**.
- `harness.mjs` at the seal: sha256 `5ab5086f000b44a49f1ffd0fa5b20562f4ed19760882cb6a9afbf38113b6906b`, equal to the `harness` pin in §3.
- **Seal commit:** `6e38ce8a88d2a8f5b7103f4e495cd38b9afbf213` (`docs(finder-verifier-frozen): seal the pre-registration (p2)`); its
  committed `gate.md` reproduces the sha256 above.
- **GitHub push time: 2026-10-10T15:29:05Z.** Source: `GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-verifier-frozen`,
  event `push`, `cf719bc..6e38ce8`, actor `Piotr-Miller`. Recorded before any price read, T0 or paid call.
- **Rebase protection:** annotated tag **`finder-verifier-frozen/seal`** (tag object `163dfb95cec1c509ff50ccaf68c7f58b835eb8f0`) on
  `6e38ce8`, pushed with the branch. `git ls-remote --tags origin 'finder-verifier-frozen/*'` shows it peeled to `6e38ce8`. A
  rebase-merge rewrites the commit SHA; the tag keeps the sealed commit reachable.

## Results

Appended after the seal; never edits `## Pre-registration`.

### Pre-flight (2026-10-10)

- **Seal:** the committed `gate.md` at `3dfae1a` hashes the section to
  `c26476825dd06a6daf0c5904591ba48ec493810ca02a197a3bb92f1938a8adaa`, equal to the record. The tag
  `finder-verifier-frozen/seal` on `origin` peels to `6e38ce8`. This is a check, not a recomputation.
- **Code and inputs:**
  - the scratch worktree is at `9c85aa2`, with `src` tree `9be94235…` and nothing uncommitted under `src` or
    `scripts/finder-gate-core.mjs`;
  - gate-core sha256 is `e713226c…bcb17`;
  - `harness.mjs` sha256 is `5ab5086f…906b`, equal to the `harness` pin.
  - The corpus and diff hashes are re-checked by the harness at start-up.
- **Endpoints** (`GET /api/v1/models/openai/gpt-6-luna/endpoints`, unauthenticated, 2026-10-10T15:30:55Z):

  | Tag (slug)    | `provider_name` | Price per M (in / out) | `reasoning` / `max_tokens` supported |
  | ------------- | --------------- | ---------------------- | ------------------------------------ |
  | `openai`      | `OpenAI`        | $0.10 / $0.50          | yes / yes                            |
  | `openai/flex` | `OpenAI`        | $0.05 / $0.25          | yes / yes                            |
  | `openai/fast` | `OpenAI`        | $0.20 / $1.00          | yes / yes                            |

  Azure (three tags) and Amazon Bedrock are listed as well; the sealed routing excludes them (`only: ["openai"]`).
  - **No stop condition of §10 holds:** the `openai` endpoint is present, its price is unchanged at $0.10 / $0.50,
    and neither parameter is lost.
  - **Noted, not a sealed condition:** OpenAI now lists two service-tier variants beside `openai`. The predecessors'
    pre-flights listed only the `openai` slug. OpenRouter's provider-routing docs (read 2026-10-10, route
    `openrouter.ai/docs/features/provider-routing`) say a base slug matches a provider's variants and regions, but
    that "service tier endpoints … are **not** matched by base slugs — they require explicit opt-in via the
    `service_tier` parameter or a tier-suffixed slug", with `openai/fast` as the example. `openai/flex` is not named
    there. The docs do not say whether the response identifies the variant that served it; every variant reports
    `provider_name: OpenAI`.

- **T0 = $54.560492781** (`GET /api/v1/key` `usage`, 2026-10-10T15:31:46Z; `usage_daily` 0; `limit` null).
  - `GET /api/v1/credits`: $60 total, $54.560492781 used, about $5.44 left.
  - It equals the last settled counter of `finder-sonnet-effort` (2026-10-07) to the micro-dollar, so nothing was
    spent since.
  - Ceiling: counter ≤ T0 + 1.00 = $55.560492781; stop and ask at T0 + 0.80 = $55.360492781.

### Ledger

| #   | Series                                                              | Started (UTC)        | P (first attempt) | T before | `--cap` | Counter after                                                                             | Telemetry (recorded) | T after   | Result                     |
| --- | ------------------------------------------------------------------- | -------------------- | ----------------- | -------- | ------- | ----------------------------------------------------------------------------------------- | -------------------- | --------- | -------------------------- |
| 1   | `series-luna.jsonl`, 114 attempts (harness `ea7a3977`, Amendment 1) | 2026-10-10T15:45:13Z | $0.053711         | $0       | $0.80   | $54.604845991 at 15:52:26Z, Δ $0.044353 (lagging; the run's own end read was Δ $0.042276) | $0.045438            | $0.045438 | **complete**, 114/114 `ok` |

The paid series was authorized by the owner on 2026-10-10 after the pre-flight and Amendment 1. T is carried as
max(counter, recorded) = **$0.045438** of the $0.80 cap; the ceiling was never approached. Expected E was $0.081953.

### Series outcome (automatic; the code-refutable hand-read is Phase 4)

From `harness.mjs report --series series-luna.jsonl`, which reproduces byte for byte.

- **Reliability:** 114/114 attempts `ok`; no failed attempt, no condition violation, no stop. Served tier `default`
  on all 114 requests (Amendment 1); 114/114 generation ids recorded. Headroom: max prompt_tokens ÷ bound 0.281, max
  cost ÷ bound 0.112 (A1–A3 held).
- **True class (hard: survive publication 3/3 base):**

  | Member              | Row  | Base                         | O   | Hard     | Diagnosis               |
  | ------------------- | ---- | ---------------------------- | --- | -------- | ----------------------- |
  | openai-pr269-01#1.2 | G-D2 | 3/3                          | 3/3 | pass     | survives                |
  | openai-pr269-02#2.1 | G-D2 | 3/3                          | 3/3 | pass     | survives                |
  | openai-pr269-03#3.2 | G-D2 | 2/3 (1 quote-not-in-excerpt) | 2/3 | unstable | investigate             |
  | openai-pr269-04#4.2 | G-D2 | 0/3 (unsupported)            | 3/3 | fail     | evidence-delivery limit |
  | openai-pr269-05#5.1 | G-D2 | 3/3                          | 3/3 | pass     | survives                |
  | openai-pr269-06#6.3 | G-D2 | 3/3                          | 3/3 | pass     | survives                |
  | openai-pr269-07#7.1 | G-D2 | 2/3 (1 unsupported)          | 2/3 | unstable | investigate             |
  | openai-pr269-08#8.2 | G-D2 | 3/3                          | 3/3 | pass     | survives                |
  | 247-r1#0            | H-R1 | 1/3                          | 3/3 | unstable | evidence-delivery limit |
  | 247-r1#2            | H-R3 | 0/3                          | 3/3 | fail     | evidence-delivery limit |
  | 247-r1#4            | H-R5 | 0/3                          | 0/3 | fail     | investigate             |

  **The true class fails its hard criterion:** 5 of 11 findings pass 3/3. The D2 defect survives 3/3 in 5 of its 8
  input variants and in at least 2 of 3 repeats in 7 of 8.

- **Code-refutable class (automatic part; hand-read pending):**
  - **G-D13 and G-D14 were `confirmed` and published 3/3 in both arms.** The verifier restated the false claims, in
    O too, where G-D13 received main's guard (`contact-sheet.py:208–211`) that refutes it. Their automatic result is
    0/3, so their hard criterion **fails** whatever the hand-read finds.
  - **G-D20 was `refuted` with a verified quote 3/3 in both arms.** Automatic 3/3; its hard result waits on the
    blinded hand-read (Phase 4).
- **Information only:** the policy, ambiguous and descriptive distributions and the per-finding detail are in the
  report.

### Blind seed (Phase 4, §9)

- Seed: **`300c74fa4dd1493d18b6cf435d79f375a5c3834cf64b2b2a93812d5b52755970`**, 32 bytes from `/dev/urandom`, written 2026-10-10T20:55:13Z, before `blind` runs. It is committed and pushed
  before the draw; the sheet's order is `sha256(seed:slot:member)`.

### Blind sheet (Phase 4, §9)

- `harness.mjs blind --series series-luna.jsonl --seed <the seed above>` gave **6 entries**: every `refuted` record of
  G-D13, G-D14 and G-D20, in both arms and every repeat. G-D13 and G-D14 have none: they were `confirmed`.
- **The sheet** is committed as `hand-read/sheet.md`, formatted by Prettier.
  - Raw output sha256: `f8cd9ae29c206963748de76c2a2f3b64779ad7334aae4ff7f57ab976da417d85`.
  - Committed file sha256: `89442e0db18b4b786c835125374f5562b820e34d31e27f3d4f43a01bbffa70a3`. Only the formatting
    differs.
  - The sheet carries no slot, member, run, `"arm"`, `"repeat"` or `blockIds` string (grep: 0).
- **`key.json`** stays outside the repository until the grades are in. sha256
  **`3e24cd3f7d21c1672ccf3f07fcafc2369460ae87adddec61b8a7db2321d1400f`**.
- **Blinding is partial,** as pre-registered: all six entries are the same row (G-D20), so arm and repeat are hidden
  but the row is not.

## Amendments

### Amendment 1 (2026-10-10)

- **Why.** The Phase 3 pre-flight (§ Results › Pre-flight) found OpenAI service-tier variants (`openai/flex`,
  `openai/fast`) beside the sealed `openai` endpoint. All of them report `provider_name: OpenAI`, so the sealed
  provider check cannot tell them apart.
  - OpenRouter's docs (read 2026-10-10) say a request that names no tier "is never routed to a non-default service
    tier" (route `openrouter.ai/docs/guides/features/service-tiers`).
  - The same docs say the response carries a top-level `service_tier` (`default`, `flex`, `priority`, `ultrafast` or
    null), and that `GET /api/v1/generation?id=…` reports `provider_name` and `service_tier` per generation (route
    `openrouter.ai/docs/api/api-reference/generations/get-generation`).
  - Owner decision 2026-10-10: record that audit trail before the series, because it cannot be recovered after it.
- **What changes:**
  - `harness.mjs` records each response's `generationId` (`id`) and `serviceTier` (`service_tier`). That covers every
    request, including retries and format repairs. A missing or null field stays null and is reported as
    `undetermined`.
  - The report's reliability section shows the tier distribution and how many generation ids were recorded.
  - `checkSeal` applies hashed amendments like this one, which may change **only** the `harness` pin and must name
    the pin they supersede.
  - **Defect fixed on the way:** `checkSeal` located `## Pre-registration seal` with a substring search. That search
    first hits this file's preamble, which mentions the heading in prose. It worked only because the first bold hash
    after that point happened to be the seal's. It now matches the heading as a whole line, with a regression case.
- **What does not change:**
  - the requests: the dry run asserts the same wire shape, with 38 requests and `failures: []`;
  - the scoring, every criterion of §7, the inputs, the budget, and the stop rules.
  - **A non-default tier is recorded and reported, never scored or stopped on** (owner: no change to requests or
    scoring).
- **Enforcement note:** the amendment is enforced by the amended harness, which reads `## Amendments`. The sealed
  harness `5ab5086f…` predates amendments and ignores them. Which harness ran is pinned in every series header
  (`harness`), so a run by the superseded harness is visible in the record.
- **Verification before this record:**
  - self-test 72/72, with 9 new cases;
  - four mutants fail: no generation id, amendment not applied, amendment hash unchecked, substring heading match;
  - `harness-plan-check.json` is byte-identical;
  - the sealed section's hash is unchanged.

```json amendment-pins
{
  "harness": "ea7a397784af1bd01a973b4f39d9365b4c23af7dc37877971dedc1b145cc37bd",
  "supersedes": "5ab5086f000b44a49f1ffd0fa5b20562f4ed19760882cb6a9afbf38113b6906b"
}
```

_End of Amendment 1._

- sha256 of `### Amendment 1 (2026-10-10)` … `_End of Amendment 1._`: **`3d2b2a40a58fbb514c60f4333a5198b08c5464c417f840a3f82baa9ed4741d96`**, computed as
  `sed -n '/^### Amendment 1 (2026-10-10)$/,/^_End of Amendment 1\._$/p' gate.md | sha256sum`; taken 2026-10-10T15:39:06Z, before
  any paid call.
- **Amendment commit:** `6e670d618b57eda2f46c1106d966335e1922b6ac` (`docs(finder-verifier-frozen): pre-flight and Amendment 1 (p3)`); its
  committed `gate.md` reproduces the amendment sha256 above, and its committed `harness.mjs` hashes to the
  amendment's `harness` pin.
- **GitHub push time: 2026-10-10T15:39:52Z** (`GET /repos/Piotr-Miller/lumina-clean-ai/activity?ref=refs/heads/feat/finder-verifier-frozen`,
  event `push`, `3dfae1a..6e670d6`, actor `Piotr-Miller`). Before any paid call.
- **Tag:** annotated **`finder-verifier-frozen/amendment-1`** (tag object `f01980c50562bdb7a565d3aa938b21d60541a67a`) on `6e670d6`, pushed;
  `git ls-remote --tags origin 'finder-verifier-frozen/*'` shows it peeled to `6e670d6`.
