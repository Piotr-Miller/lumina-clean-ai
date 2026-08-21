# Finder Fabrication Ablation Campaign — Plan Brief

> Full plan: `context/changes/finder-fabrication-triggers/plan.md`
> Research: `context/changes/finder-fabrication-triggers/research.md`

## What & Why

The finder fabricates on exactly one known artifact (PR #127) and on nothing synthetic — 50 clean
rows proved guessing at fixtures burns budget. Research decomposed the defect into three mechanisms
(M1 pipeline-manufactured, M2 contradicting visible code, M3 locality gap) and left one surviving
trigger hypothesis, **H\***: _in-window security-subject content referencing material the cap made
invisible_. This campaign measures H\* by ablating the reproducing artifact itself, under
pre-registered gates, and closes with the knowledge a representative fixture can be built from.

## Starting Point

The existing probe cannot measure fabrication (aggregates only, no captured findings, stale recipe
diverging from CI in 4 ways, no cost data). Fabrication has never been graded locally — the
archived "2/8" was a severity-collapse count. Two runnable reproducing variants exist, byte-anchored
(CI 215,560 B; instrument 266,444 B).

## Desired End State

Baseline fabrication rates for both variants (n=20 each), R1–R3 ablation verdicts read off
pre-registered falsifiers, and two closing artifacts: `decision.md` (what triggers fabrication, per
mechanism) and `fixture-spec.md` (the paper design of the fixture the results justify). The R5
finder truncation-note fix is handed off as its own change regardless of outcome.

## Key Decisions Made

| Decision           | Choice                                                       | Why (1 sentence)                                                                | Source   |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| Method             | Ablate the reproducing artifact, never build fixtures first  | 50 synthetic rows / 0 reproductions killed the build-up approach.               | Research |
| R5 truncation note | Excluded — its own follow-up change                          | Measurement and intervention must not conflate; M1 needs no more evidence.      | Plan     |
| Ablation base      | Both variants at baseline; CI variant for rungs              | The variant pair is a free natural experiment; rungs stay production-faithful.  | Plan     |
| Budget shape       | Baselines n=20; rungs 8 → cumulative 20; 140-attempt ceiling | Exact denominators everywhere; errors consume reserve, never denominators.      | Review   |
| Grading            | Window-relative llm-rubric, M1/M2/M3 split, hand-read checks | Raw-diff grading mislabeled F10; regex grading died in seven rounds.            | Research |
| Inconclusive exit  | Stop at ceiling, record, hand off — no renegotiation         | Exhausting a pre-committed budget is evidence about the approach.               | Plan     |
| Closing artifact   | Decision doc + fixture SPEC (no fixture)                     | The change's charter: "knowing what to build a fixture out of — not a fixture". | Research |

## Scope

**In scope:** probe + grader scripts (`fabrication-probe.mjs`, `fabrication-grade.mjs`) with
hermetic tests, an export-only `capDiff` change (parity-tested), window-relative ground-truth
inventories frozen for base AND every rung, pre-registration (`verification.md`), baselines,
R1/R2/R3/R-loc rungs with escalation, decision doc + fixture spec.

**Out of scope:** R5 truncation note, any production BEHAVIOR change, fixture construction, model
swap, severity calibration, budget extensions.

## Architecture / Approach

Hard free/paid boundary after Phase 2. Phases 1–2 build and freeze the instrument, ALL rubrics
(base + rungs), and a fully numeric read-off table with zero spend (dry-run byte anchors 215,560 /
266,444 prove recipe fidelity). Phase 3 baselines both variants — calibration is the first
observation (1+19), fixing the $ ceiling — guarded by G1 (both variants 0/20 → INVALID-PREMISE)
and G2 (CI baseline < 5/20 → INSUFFICIENT-CI-SIGNAL stop). Phase 4 screens R1 (lift cap,
M1-scoped), R2 (drop prose), R3 (prose-only), R-loc (inject off-diff definitions, M3-scoped) and
escalates mechanically. Phase 5 reads everything off the pre-registered table. Claims are scoped
to single-attempt tool-less draws — the production-faithful element is the input, not the loop.

## Phases at a Glance

| Phase                | What it delivers                                | Key risk                                                        |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| 1. Instrument repair | Probe + grader + ground truth, dry-run verified | Ground-truth inventory errors poison all grading                |
| 2. Pre-registration  | Frozen gates, budget, rubric before any spend   | A gate that can't see its failure mode (lessons: guard metrics) |
| 3. Baselines (paid)  | First graded fabrication rates, 2×20 runs       | G1/G2 fire — signal may be absent or below the 5/20 floor       |
| 4. Ablation rungs    | R1/R2/R3/R-loc verdicts off the numeric table   | All rungs flat → INCONCLUSIVE at ceiling                        |
| 5. Synthesis         | decision.md + fixture-spec.md + R5 handoff      | Post-hoc interpretation creeping past the gate read-offs        |

**Prerequisites:** `OPENROUTER_API_KEY` in `packages/code-reviewer/.env` (Phases 3–4 only); git
history reachable for the #127/#86 SHAs (scratch refs already fetched).
**Estimated effort:** ~3–4 sessions — Phases 1–2 in one, Phase 3 one, Phase 4 one, Phase 5 short.

## Open Risks & Assumptions

- **G1 may fire**: fabrication was only ever observed in CI runs; local tool-less runs may grade
  0/20. That outcome is pre-registered as INVALID-PREMISE, not failure.
- The rubric is rebuilt per rung (windows change); each rebuild is a fresh chance of a grading gap
  — mitigated by append-only deltas + the hand-read protocol.
- Cost per run is unmeasured until Phase 3's first run; the ceiling formula (120 × cost × 1.5) is
  pre-registered, the dollar number is not.

## Success Criteria (Summary)

- Every number in `decision.md` traces to a gate committed before the run that produced it.
- H\* is either supported by a discriminating rung, falsified, or the campaign records exactly why
  neither was reachable (INVALID-PREMISE / INCONCLUSIVE).
- A successor change can build the fixture (or the R5 fix) from the closing artifacts without
  re-reading raw results.
