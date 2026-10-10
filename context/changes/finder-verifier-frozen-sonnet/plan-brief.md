# Sealed verifier on frozen findings, stage 2 (sonnet-5) — Plan Brief

> Full plan: `context/changes/finder-verifier-frozen-sonnet/plan.md`
> Research: `context/changes/finder-verifier-frozen-sonnet/research.md`

## What & Why

Stage 1 ran the sealed verifier with luna. It failed both hard criteria: the true class kept 5 of 11 findings and the
code-refutable class refuted 1 of 3. Luna confirmed G-D13 and G-D14 six times each although their counterevidence
was in the excerpts.

Stage 2 repeats the experiment with one property changed, the model (`anthropic/claude-sonnet-5` @ `anthropic`). It
asks whether a stronger judge fixes the judgement failures. It cannot fix evidence delivery, which belongs to the
sealed excerpts.

## Starting Point

The sealed verifier (`9c85aa2`) is model-neutral and stays untouched. Stage 1's harness is archived. It pins luna in
`PINS`, cannot change its model by amendment, cannot run from the archive, and caps spend at $1.00. At $2 / $10 per M
its admission reserve P is about $1.1 per attempt, so it would admit nothing.

## Desired End State

A sealed, pushed, tagged stage-2 pre-registration that differs from stage 1 only in model, slug, harness and budget.
A probe record taken before the seal. A complete `series-sonnet.jsonl`. Results per class with a blinded hand-read,
and an information-only side-by-side with stage 1. The owner then records the next decision.

## Key Decisions Made

| Decision                   | Choice                                                                                                                                           | Why (1 sentence)                                                                                                 | Source                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Scope of change            | Model, slug, provider identity, budget only; criteria, corpus, arms, rationales and compounds verbatim                                           | Ablate one property from the artifact that reproduces the failure                                                | Owner (4.7) / lessons            |
| Budget                     | Sealed P kept; `CAP_HARD` $4.50, `--cap 3.90`                                                                                                    | Owner variant (a): the same instrument, a raised cap; expected spend about $2.2                                  | Owner                            |
| Probe                      | One attempt on a synthetic, non-corpus batch, before the seal, at most $0.60 for every request, retry and repair included (conditional on A1–A3) | Tests the wire (provider, reasoning, tier, A2) without showing any corpus verdict before the criteria are sealed | Owner (probe) / Plan (placement) |
| Reasoning enforcement      | Add a fourth channel: any non-empty `reasoning_details` is a violation                                                                           | Encrypted thinking is dropped by the SDK and invisible to stage 1's three channels                               | Research                         |
| Missing `reasoning_tokens` | Recorded as `absent`, not 0, and not a violation by itself                                                                                       | Anthropic may not report the field; the other channels still catch thinking                                      | Plan                             |
| T0 read time               | `--t0-at` required and pinned                                                                                                                    | Closes stage 1's `t0At` caveat                                                                                   | Predecessor review               |
| Credit check               | Read before the probe: stop if below $5.10 ($0.60 + $4.50). Re-read before the series: stop if below $4.50, without re-adding the probe's spend  | `CAP_HARD` is sealed inside the harness                                                                          | Plan                             |
| Worktree                   | Re-created at `~/.cache/finder-verifier-frozen-sonnet/fv-seal` with `npm ci`                                                                     | The current one lives in another session's scratchpad                                                            | Research                         |

## Scope

**In scope:**

- a harness copy with minimal edits;
- the probe;
- the pre-registration and seal;
- the 114-attempt series;
- the blinded hand-read;
- the results and the side-by-side.

**Out of scope:**

- any change to the sealed code or the request shape (including `cache_control`);
- any change to a criterion, class or rationale;
- a corpus-input probe;
- porting the effort branch (F2, F4);
- re-enabling AI review;
- sonnet-5.5;
- edits to `context/archive/`.

## Architecture / Approach

The sealed `src` tree fixes the request. The harness fixes the target and the money. Stage 2 edits only the harness:
the `VERIFIER` constant, the provider checks via the sealed `ENDPOINT_NAMES`, `CAP_HARD`, a `reasoning_details`
latch, `--t0-at`, and a `probe` mode that skips the seal and admission but keeps the Request gate. `plan` mode must
reproduce stage 1's excerpt serving byte for byte.

## Phases at a Glance

| Phase                       | What it delivers                                                                 | Key risk                                                                                |
| --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Instrument (free)        | Harness copy, new self-test cases, three mutants failing                         | An unintended change to inherited behaviour                                             |
| 2. Probe (≤ $0.60)          | `probe.md` and `probe.jsonl`: provider, reasoning, tier, A2 on the real endpoint | Wire lacks `provider`, which reopens Phase 1; reasoning not off, which stops the change |
| 3. Seal (free, push)        | Sealed, tagged `gate.md`                                                         | A pin drift beyond model, slug and harness                                              |
| 4. Series (≈ $2.2, ≤ $4.50) | `series-sonnet.jsonl`, ledger, report                                            | Spend near the admission stop (T ≈ $2.74)                                               |
| 5. Hand-read and results    | Grades, verdicts, side-by-side, the owner's decision                             | Over-reading a 3-finding class                                                          |

**Prerequisites:**

- `OPENROUTER_API_KEY`;
- credit ≥ $5.10 before the probe, and ≥ $4.50 again before the series;
- owner authorization at Phases 2 and 4, and approval at Phase 3.

**Estimated effort:** about 2–3 sessions. Phase 1 is the bulk of the work. Phases 2–5 mostly wait on owner reads.

## Open Risks & Assumptions

- **A2 has no published basis for Claude.** The probe measures the headroom, and the after-the-fact detector remains
  the enforcement.
- **`enabled: false` is documented as honoured but never observed locally.** The probe decides it.
- **Sonnet 5 is "Legacy" at Anthropic.** A deprecation between seal and series is a sealed stop condition.
- **Total worst case is $5.10 against about $5.39 credit.** A 402 is an account violation and stops the series.

## Success Criteria (Summary)

- The probe shows sonnet-5 @ `anthropic` served by Anthropic, with no reasoning on any channel and A1–A3 headroom,
  before anything is sealed.
- The series runs under a seal that differs from stage 1 only in model, slug, harness and budget, within $4.50.
- The results answer stage 1's question for sonnet-5 per class, comparable row by row with luna.
