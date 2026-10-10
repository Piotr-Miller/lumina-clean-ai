# Sealed verifier on frozen findings — Plan Brief

> Full plan: `context/changes/finder-verifier-frozen/plan.md`
> Research: `context/changes/finder-verifier-frozen/research.md`

## What & Why

The verifier built in `finder-verification` was never measured on real findings. Its only run stopped on a fixture
whose failure was mostly the finder's. The question here: given findings whose truth the owner has already
classified, does the verifier, **unchanged and exactly as sealed**, keep the true ones (D2 above all) and refute
the ones the code contradicts? Freezing the findings removes finder randomness from the answer.

## Starting Point

- **The code:** the sealed code lives at the pushed tag `finder-verification/seal`. A scratch worktree of it
  reproduces every sealed hash and passes all 1,086 package tests.
- **The harness:** `harness.mjs` already plans excerpts for the 75 frozen findings. For the 38 G findings this
  matches the sealed backcheck with 0 mismatches. It also runs the full verification path on a stubbed HTTP
  client: 38 requests, 0 failures.
- **D2 is handicapped in base:** 7 of its 8 members get 14/30 evidence lines.

## Desired End State

**`gate.md`** holds three things:

- a pushed, sealed pre-registration;
- a ledger of spend;
- results per finding, per repeat and per class for both arms.

**The results give:**

- the true-class 3/3 verdict, with a diagnosis per finding (`survives` / `evidence-delivery limit` /
  `investigate` / `anomaly` / `lost to reliability`);
- the code-refutable verdict, automatic and blinded hand-read side by side;
- reliability, reported apart from judgement quality.

**The owner then records a stage-2 decision.** Production is untouched.

## Key Decisions Made

| Decision          | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                   | Source             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Run route         | Worktree at `finder-verification/seal` + harness in the change folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Measures exactly the sealed code; no port, no merge                                                                                                                                                                   | Research → owner   |
| Compound findings | Verified whole, flagged, never split                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Splitting would improve the input and measure another variant                                                                                                                                                         | Owner (2)          |
| Scoring           | Per class; hard only for true (survive publication) and code-refutable (refute)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The verifier checks truth, not reportability; policy rows are not its job                                                                                                                                             | Owner (3, 8)       |
| Arm O             | Base + frozen evidence lines, diagnostic only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Separates evidence delivery from model judgement, mainly for D2                                                                                                                                                       | Owner (4, 7)       |
| Model             | luna only; sonnet is stage 2, on a later decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A model change cannot fix evidence the excerpts never deliver                                                                                                                                                         | Owner (5)          |
| Threshold         | 3/3 base repeats per finding; 2/3 majority as information                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Matches the sealed "D2 in every valid run"; production draws once                                                                                                                                                     | Owner (9)          |
| Refuted           | `refuted` + sealed quote check + blinded hand-read against pre-registered rationales                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A quote check proves provenance, not that the quote contradicts the claim                                                                                                                                             | Owner (10)         |
| Failures          | Error precedence: harness → account (401/402, own or cause) → violations in the recorded steps → model-attributable (incl. unparseable `length`; `no-output` with its cause) → measurement error. Failed attempt = the whole batch fails that repeat, no re-draw. A parseable `length` answer is scored, flagged. Interrupted = reconciled, never re-sent, not met                                                                                                                                                                              | Count attempts, not successes; nothing deleted or re-sent                                                                                                                                                             | Owner (11), review |
| Budget            | One total cap with two checks: before **every request** a `fetch`-seam gate admits it only if T + its bound ≤ cap, where the bound is the real body bytes plus `max_tokens`, logged durably before sending and checked after; before every attempt an admission reserve P (≈ $0.053–0.058) avoids starting attempts the gate would cut. T = max(counter − T0, recorded costs), with T0 pinned in the header; interrupted slots are charged max(P, Σ request bounds), never lowered by the counter. Cap $0.80, hard $1.00; expected total $0.079 | The cap holds per request **under stated assumptions** (text tokens ≤ bytes, template overhead ≤ 32/message + 32, prices ≤ 1.10 × pre-flight). A broken assumption is detected after one request and stops the series | Owner (12), review |
| Sealed gate       | Unchanged; this experiment cannot justify re-enabling AI review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | It measures claim truth only                                                                                                                                                                                          | Owner (6)          |
| Repeat order      | Interleaved: r1 all batches (base, O), then r2, then r3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Spreads provider drift over both arms equally                                                                                                                                                                         | Plan               |

## Scope

**In scope:**

- finishing the harness (paid run, report, blind sheet, self-test);
- the pre-registration and seal;
- one luna series of 114 attempts;
- a blinded hand-read of the D13, D14 and D20 refutations;
- the results and the owner's decision.

**Out of scope:**

- sonnet;
- any change to sealed code, policy or prompt;
- splitting findings;
- changing the sealed gate;
- re-enabling AI review;
- classifying set E;
- finder recall (D2 detection).

## Architecture / Approach

The harness imports the sealed `src/` from the worktree and refuses any tree, corpus, diff or harness hash
mismatch. Each original run is one batch.

- **Base** calls the sealed `runVerificationPass` unchanged.
- **O** reproduces its step 3 on a plan with extra evidence blocks, rendered byte-identically.

Every attempt is appended to `series-luna.jsonl`, and `report` derives every table from that file alone.

## Phases at a Glance

| Phase                           | What it delivers                                                                         | Key risk                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Finish the instrument        | `run` (start/end lines), `reconcile`, `report`, `blind`, `self-test` covering every rule | Arm O's telemetry diverging from the sealed pass's; a crash between request and record |
| 2. Pre-registration and seal    | `gate.md` sealed, tagged, pushed; compound list approved                                 | Anything left unpinned becomes post-hoc                                                |
| 3. Paid measurement             | Pre-flight, 114 attempts, ledger                                                         | Price or provider change; a condition violation mid-series                             |
| 4. Hand-read, results, decision | Blinded grades, results per class, stage-2 decision                                      | Blinding leaks through the quoted content itself                                       |

**Prerequisites:**

- the scratch worktree at the seal tag, with `npm ci` done;
- an `OPENROUTER_API_KEY` in the environment for Phase 3 only;
- owner approval at Phase 2 and authorization at Phase 3.

**Estimated effort:** about 2 sessions. Phase 1 is the bulk; Phases 2–4 are short and owner-paced.

## Open Risks & Assumptions

- **D2 will probably fail base on evidence delivery.** That is a real result about the production policy, and arm
  O exists to say so.
- **Only 3 code-refutable findings, 9 base observations.** A clean pass is suggestive, not general.
- **Arm O's blocks can duplicate lines** that another finding's blocks already carry in the same prompt. That is
  accepted and documented: O changes only evidence, never removes anything.
- **Blinding is partial.** Quotes and reasons are identical in kind across arms, but an O quote may come from a
  line only O delivers.
- **The last known credit is about $5.44** (2026-10-07). It is re-read at the pre-flight.

- **The cost cap is conditional.** The per-message template overhead (32 tokens + 32) has no published guarantee
  for the pinned endpoint. A breach is detected after the request that caused it, and only that request's excess
  is unprevented. The report shows the observed headroom.

## Success Criteria (Summary)

- A sealed, pushed pre-registration exists before the first paid request, and every result traces back to it.
- Every finding has a per-repeat record in both arms, and failures are visible and counted, never dropped.
- The owner can read one table and know: does the verifier keep D2 and the other true findings, does it refute
  the code-contradicted claims for the right reason, and if not, is the limit evidence delivery or judgement?
