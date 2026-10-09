# Finder model swap — Plan Brief

> Full plan: `context/changes/finder-model-swap/plan.md`
> Research: `context/changes/finder-model-swap/research.md`

## What & Why

The ai-review finder has no admitted model: the predecessor removed the outage's cause in code, but no
`glm-4.6` endpoint passed its gate. This plan measures three cheaper, tool-capable replacements against a gate
registered before the first paid call, and changes production only for a candidate the owner admits.

## Starting Point

The finder code (no `response_format`, reasoning off, pinned routing) is on this branch, not on `master`. The
gate runner and promptfoo config know only `glm-4.6`; the promptfoo-to-gate extraction and the hand-read
sampling were done by hand last time. No candidate has any evidence on this task.

## Desired End State

`gate.md` holds a pre-registration and one verdict label per candidate, backed by raw JSONL and a spend ledger.
Either no candidate is admitted and production stays without a finder, or the owner admits one and it ships by
PR after a green live scratch PR (G5) and T2.

## Key Decisions Made

| Decision             | Choice                                                                           | Why                                                                     | Source                                        |
| -------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| Candidates and order | gpt-6-luna@openai → qwen3.8-flash@alibaba → minimax-m3@minimax; no gpt-6-sol     | Eligible (reasoning can be off, tools), affordable, ordered by owner    | Owner 2026-10-02 / Research                   |
| Budget               | $2.00 total incl. grader, judge, G5; stop and ask past $1.60                     | Bounded spend; "not measured (budget)" never a verdict                  | Owner 2026-10-02 (G5 inside: plan assumption) |
| Gate                 | Archived G1–G4 unchanged + hand-read 40, ≤ 2 rejected, floor(0.05N)              | Same bar as last cycle plus a measurable hand-read                      | Owner 2026-10-02                              |
| Order per candidate  | G2 (attempt 01 = A3 probe) → G3/G4 → G1; stop at first decisive failure          | Verdict is a conjunction; cheapest first; protects budget for all three | Owner 2026-10-03                              |
| G4 failing alone     | Pause; owner decides whether to spend on G1                                      | Archived G-A1                                                           | Owner 2026-10-03                              |
| A3                   | Every request, both channels, every gate                                         | The probe is an early exit, not the only check                          | Owner 2026-10-03                              |
| OpenAI tiers         | Pin `openai`, no code change; one-off cost report                                | Base slugs exclude service tiers (OpenRouter docs)                      | Owner 2026-10-03 (agent premise corrected)    |
| Dedup                | Blind dedup by registered rule; owner approves merges/splits; sha256 before seed | Merges set N, and N sets the limit                                      | Owner 2026-10-03                              |
| Tooling              | Testable gate core, `--model`/`--through`, promptfoo-rows and sample scripts     | A check must say what it found; no hand extraction                      | Plan                                          |

## Scope

**In scope:** pre-registration; runner and promptfoo tooling with tests; measurement of three candidates;
hand-read for automated passers; decision 4.4; production pointers, T2, G5 and PR only for an admitted model.

**Out of scope:** other models; threshold changes after results; re-runs or re-draws; `ignore`/`service_tier`
routing; re-reading Novita; hardening fixture rows.

## Architecture / Approach

Phase 0 registers the gate and reproduces #269's inputs byte for byte. Phase 1 adds `finder-gate-core.mjs`
(provider check, A3 on three channels, cost completeness), `--model` and `--through` to the runner, three
promptfoo providers, `promptfoo-gate-rows.mjs` (12-row check, G3 metrics, G4 median) and
`hand-read-sample.mjs` (freeze sha256, seeded draw). Phase 2 spends, reading the OpenRouter key counter before
and after every series. Phase 3 is the owner's hand-read and 4.4. Phase 4 moves `DEFAULT_MODEL`,
`DEFAULT_FINDER_PROVIDERS` and the repository variable together.

## Phases at a Glance

| Phase                          | What it delivers                                      | Key risk                                                    |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| 0. Pre-registration and inputs | `gate.md` Pre-registration; reproduced #269 inputs    | Inputs fail to reproduce → nothing comparable               |
| 1. Gate tooling                | Model-agnostic runner; tested extraction and sampling | Probe path adding a sixth G2 attempt                        |
| 2. Measurement (paid)          | One verdict label per candidate; spend ledger         | Reasoning cannot be turned off; 429 on single-endpoint Qwen |
| 3. Hand-read and 4.4           | Owner-approved samples; admission decision            | ≤ 2/40 has never been met by any measured model             |
| 4. Production (conditional)    | Pointers moved, T2, G5 green, PR                      | Live behaviour differs from fixtures                        |

**Prerequisites:** OpenRouter key in `packages/code-reviewer/.env`; #269 worktree at `fca2778`; owner approval of
the Pre-registration before Phase 2.
**Estimated effort:** ~~1 session for Phases 0–1; Phase 2 a few hours of paid runs (~~$0.6–1.2 estimated);
Phase 3 owner time per passer; Phase 4 ~1 session.

## Open Risks & Assumptions

- G5 spend is counted inside the $2.00 (plan assumption; the owner can overturn it).
- Expected provider names (`OpenAI`, `Alibaba`, `Minimax`) come from the endpoints API; a different notation on
  G2-01 stops that candidate for an owner decision rather than being patched silently.
- Most likely outcome on past evidence: no candidate admitted.

## Success Criteria (Summary)

- Every candidate ends with exactly one pre-registered verdict label, and spend never exceeds $2.00.
- Any admitted model passed G1–G4 and the hand-read under rules written before it was measured.
- Production changes only after 4.4, with all three pointers moved together and G5 green.
