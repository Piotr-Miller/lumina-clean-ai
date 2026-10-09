# Finder verification — Plan Brief

> Full plan: `context/changes/finder-verification/plan.md`
> Research: `context/changes/finder-verification/research.md`

## What & Why

`openai/gpt-6-luna` passed every automated finder gate, but 19 of its 20 distinct findings on #269 were rejected
in the hand-read. Five of them were contradicted by lines the finder could have read. The hypothesis is that a
verification step that publishes a finding only when the verifier quotes code confirming it will bring the
false-finding rate under the unchanged G3 threshold. This plan builds that step and measures it against a
gate registered before any paid call.

## Starting Point

The judge is blind to code and grades whatever list it gets. Comment, labels and exit code depend only on its
verdict. CI already passes a source root, and a diff-scoped provider reads files for the finder. The gate
tooling measures the finder alone, and one fixture metric regex-tests the whole output object. `ai-review` is
off on `master` (`68151b0`, R11).

## Desired End State

Every review runs finder → verifier → judge. Only `confirmed` findings with a verbatim, code-checked quote are
published. Every other verdict is kept in review.json with its reason. `gate.md` records sealed results for
CONTROL (and for MAIN, if it was needed), plus the owner's decision 4.4. An admitted arm ships through G5 on
this change's own PR, with `ai-review` turned back on.

## Key Decisions Made

| Decision              | Choice                                                                                                                                                                                                                                                                                                                                                                                                            | Why (1 sentence)                                                                                                           | Source                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Construction          | Separate verifier call; judge byte-identical; one implementation for both arms                                                                                                                                                                                                                                                                                                                                    | Smallest blast radius; the arms differ only in the model id                                                                | change.md R1                                                                                        |
| Arms and order        | CONTROL luna first; MAIN sonnet-5 only after a CONTROL quality-gate failure                                                                                                                                                                                                                                                                                                                                       | Learn whether an independent model is needed at all                                                                        | R1, R2                                                                                              |
| Publication           | Only `confirmed` with a quote that is a substring (≥ 10 non-whitespace chars), exact or with whitespace runs collapsed (`quoteMatch`; token order must match)                                                                                                                                                                                                                                                     | Code, not the model, decides; fail closed; a re-indented quote is not a fabrication                                        | R5 + Plan (floor) + owner (re-review F4)                                                            |
| Excerpts              | §7 policy without E5: header 40 lines, unit 80, 2 callers ±20, 2 cross-file units of 40, ≤ 220 lines / 16,000 chars per finding, ≤ 60,000 chars and 25 findings per review; a TS/JS unit ends at a column-0 `}` / `};` / `});`; a zero-unit file's header is lines 1 … min(40, total); units checked both ways against `ts.createSourceFile` (E2's grammar) and Python `ast` on every frozen file before the seal | Deterministic and sealable; over a limit means unverifiable; absence claims cannot be confirmed by quoting what is present | R6, narrowed by the owner (review F3) + Plan (numbers, approved at the seal) + owner (re-review F2) |
| Reasoning             | Off on both arms                                                                                                                                                                                                                                                                                                                                                                                                  | A reasoning variant is a separate construction                                                                             | R7                                                                                                  |
| No source root        | Local pass-through with a warning; CI aborts via `--require-verification`                                                                                                                                                                                                                                                                                                                                         | The CLI has no CI detection, so CI policy is explicit input                                                                | R8 + Plan (flag)                                                                                    |
| Cost                  | G4 unchanged (finder, fixtures); G4b ≤ $0.063 median per PR series; 0 verifier/judge timeouts                                                                                                                                                                                                                                                                                                                     | Baseline is PR #132's whole review                                                                                         | R3                                                                                                  |
| G1 scope              | ≥ 9/10 per PR series, whole pipeline valid                                                                                                                                                                                                                                                                                                                                                                        | The system under test is now three passes                                                                                  | Plan (approved at the seal)                                                                         |
| G3                    | Separately per PR (#269, #240), both must pass; pooled figure informational                                                                                                                                                                                                                                                                                                                                       | #269 cannot mask #240                                                                                                      | Plan Q (owner)                                                                                      |
| Recall guard          | Each raised known defect published (≥ 1 matched finding published) in ≥ floor(k/2)+1 of its k attempts; a finding may match several defects; none raised → NOT PROVEN, never PASS                                                                                                                                                                                                                                 | Measures exactly what the verifier can lose                                                                                | R4 + Plan Q (owner)                                                                                 |
| Hand-read reuse       | Inherit only when PR, code version, dedup key and claim all match; owner approves                                                                                                                                                                                                                                                                                                                                 | Saves reading without inheriting observations                                                                              | R10 + Plan Q (owner)                                                                                |
| Seal order            | Freeze #240/#247 and push → write prompt → seal content hashes → first paid call                                                                                                                                                                                                                                                                                                                                  | MAIN is never tuned on #240                                                                                                | R9                                                                                                  |
| One verification path | `runVerificationPass` is used by the pipeline, the G2 runner and promptfoo rows                                                                                                                                                                                                                                                                                                                                   | The gate measures the code production runs                                                                                 | Review F4                                                                                           |
| Fixture sources       | Verifier-only trees for the JS-loop and React rows via `verifierRoot`; React line 5 forced by the hunk header, lines 6–9 authored and neutral (owner, Phase 0 correction), frozen in Phase 0                                                                                                                                                                                                                      | R4's 3/3 on published findings needs every row verified; the finder stays tool-less                                        | Review F1                                                                                           |
| Fixture grading       | On verifier rows `summary` is a fixed code-written string; the finder's summary goes to metadata                                                                                                                                                                                                                                                                                                                  | Recall must be earned by published findings, not by the finder's pre-verification prose                                    | Owner (re-review F1)                                                                                |
| Gate runner reader    | The runner always builds the verifier's reader and requires verification; any other status is a measurement error                                                                                                                                                                                                                                                                                                 | A skipped verification must never count as a valid attempt                                                                 | Owner (re-review F3)                                                                                |
| Quote schema          | `quote` required, empty allowed, no schema refine; an empty quote is handled per finding                                                                                                                                                                                                                                                                                                                          | A refine is invisible to the model and would fail the whole output (`schemas.ts:56–66`)                                    | Owner (3rd review F1)                                                                               |
| Evidence tags         | Tags `finder-verification/freeze`, `/seal`, `/amendment-<n>` pushed before the Phase 8 rebase                                                                                                                                                                                                                                                                                                                     | The rebase and rebase-merge orphan the commits that prove the order                                                        | Owner (3rd review F3)                                                                               |
| Restore `ai-review`   | Remove only the `false &&` line before G5, in this change's PR; rewrite the comment's first sentence                                                                                                                                                                                                                                                                                                              | The PR that restores the job is the one G5 runs on                                                                         | Owner, 2026-10-04; review F6                                                                        |

## Scope

**In scope:** structured source reader; excerpt planner; verifier schema, prompt and call; pipeline, CLI and
action wiring; review.json records and judge latency; gate runner over the whole pipeline; fixture rows on
published findings; recall-guard and reuse tools; policy backcheck; seal; CONTROL measurement and hand-reads;
MAIN if triggered; decision 4.4; production with G5.

**Out of scope:** any judge change; reasoning; Jev; `gpt-6-sol`; measuring #247; a paid judge baseline; R11's
skip PR (already on `master`).

## Architecture / Approach

`finder → assignFindingIds → [offDiffFindingPaths on this set] → planExcerpts (source root via diff-scoped
reader) → verifier (one call) → applyVerdicts (quote check in code) → published → judge (unchanged)`.
review.json gains `preVerificationFindingCount`, `verification`, `verifierTelemetry` and
`judgeTelemetry.latencyMs`; `models` stays `{finder, judge}`.

## Phases at a Glance

| Phase                 | What it delivers                                                                                        | Key risk                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0. Freeze + draft     | #240/#247 and the two verifier-only fixture trees frozen and pushed before any prompt; protocol drafted | The freeze not provably before the prompt                    |
| 1. Construction       | Verifier pass, excerpts, R8                                                                             | A quote path that publishes unconfirmed findings             |
| 2. Gate tooling       | Whole-pipeline runner; published-only fixture grading                                                   | Recall metric satisfied by quoted source                     |
| 3. Backcheck + seal   | Policy re-measured on #269; defect list; hashes; seal                                                   | Policy serves < 10 of 20 rows → owner before seal            |
| 4. CONTROL (paid)     | Sealed series with budget checks                                                                        | Measurement errors mistaken for model failures               |
| 5. CONTROL reads      | R4, G3 per PR, verdict                                                                                  | N ≤ 19 per PR means a limit of 0                             |
| 6. MAIN (conditional) | Same protocol, sonnet verifier                                                                          | Budget: crosses $1.60 early, cannot finish in $2.00 with G5  |
| 7. Decision 4.4       | Admit one arm or none                                                                                   | —                                                            |
| 8. Production + G5    | Evidence tags pushed, variable deleted, defaults, `false &&` removed, G5 cost projected, G5, merge      | G5 cost with impl review on a three-change diff inside $0.50 |

**Prerequisites:** R11's skip is on `master` (done, `68151b0`). The owner writes the #240 known-defect list
before the seal.
**Estimated effort:** ~2 sessions of code (Phases 1–2), plus 1 for the seal, 1 for CONTROL measurement and
hand-reads, and more if MAIN runs.

## Open Risks & Assumptions

- **MAIN does not fit the budget.** Pessimistic arm totals are CONTROL $1.05 and MAIN $2.12. MAIN's first PR
  series likely crosses $1.60 after CONTROL, so running MAIN needs an owner decision.
- **MAIN may fail G4b by construction.** At about 6 findings per attempt, MAIN totals ≈ $0.06–0.07 against
  the $0.063 limit.
- **#240's unseen status has one nuance.** CI sent #240's diff to `glm-4.6` during the outage, and the run
  failed with no output. #240 still counts as unseen under the "any finder output" rule; `gate.md` records it.
- **No human defect record exists for #240.** An empty list makes R4 `NOT PROVEN` by rule, so neither arm
  can then be admitted on recall.
- **Authored fixture lines:** React lines 5–9 are not in the diff. Line 5 (`function formatValue(value, unit) {`)
  is forced by the hunk header; lines 6–9 are authored, neutral toward the three planted flaws, and hashed before
  the prompt exists (owner, 2026-10-04, Phase 0 correction).
- **Assumptions the owner confirms one by one at the seal (six):** G1 is scoped to the whole pipeline; a retried
  timeout counts against R3; the quote floor is 10 characters; the excerpt numbers; the enumeration of quality
  gates; the whitespace-collapsed second quote comparison.
- **G5 needs two owner steps (re-review F5):** deleting the repository variable `OPENROUTER_REVIEW_MODEL`
  (`z-ai/glm-4.6` today) before G5, and a G5 cost projection on the real `origin/master...HEAD` diff, which also
  carries the two archived predecessor changes (over $0.50 → stop and ask).

## Success Criteria (Summary)

- An admitted arm passes every sealed gate: G3 ≤ floor(0.05 × N) rejected on **each** PR, and R4 `PASS`.
  G4b, G1 and the timeout clause hold. G5 is green with `ai-review` restored.
- Or the record shows, against a seal written before any spend, why no arm was admitted.
