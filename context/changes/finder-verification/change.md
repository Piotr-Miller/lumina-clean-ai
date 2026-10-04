---
change_id: finder-verification
title: "Finder verification: a finding must cite confirming code before it is published"
status: implementing
created: 2026-10-03
updated: 2026-10-04
archived_at: null
---

## Notes

Owner decision of 2026-10-03: **path C.** Branch `feat/finder-verification`, created from `feat/finder-model-swap`
at `573ee33` (its HEAD after archiving), because this change needs the two-stage finder code and the gate
tooling that `master` does not have.

### Where this comes from

- The archived [`finder-model-swap`](../../archive/2026-10-02-finder-model-swap/change.md) — its
  [`gate.md`](../../archive/2026-10-02-finder-model-swap/gate.md) (pre-registered gate, measurement,
  hand-read, decision 4.4) and
  [`hand-read-269-presort.md`](../../archive/2026-10-02-finder-model-swap/hand-read-269-presort.md)
  (the 20 findings of `openai/gpt-6-luna` on #269, each with the owner's classification and a code pointer).
- The archived [`finder-serialization-outage`](../../archive/2026-09-24-finder-serialization-outage/change.md)
  — the two-stage finder (gathering loop, tool-less finalization, strict parser, one format repair) and its
  own hand-read of #269 per endpoint.

### Observation

`openai/gpt-6-luna` passed the automated G1–G4 (G1 10/10 valid attempts, 0 repairs; median $0.0048 and 13 s
per #269 attempt), yet **19 of its 20 distinct findings were rejected** in the hand-read. Five of them
contradicted the code (D1, D13, D14, D15, D20), and the pre-sorting agent refuted them by reading the cited
lines at `fca2778` — the same reading the finder could have done before publishing.

### Hypothesis to test — not a decision

A verification step for every finding before it is published — the model must quote the code that confirms
the claim; a finding without confirmation is dropped — lowers the share of false findings to the G3
threshold.

### Constraints

- **The G3 threshold does not change:** at most 5% rejected, unresolved counts as rejected, floor(0.05 × N)
  when N < 40.
- **A new construction needs a new, separately registered gate before any measurement.**
- The #269 data from the previous changes is known, so the gate must also carry **a case nobody has seen
  yet** (e.g. a new PR or a new diff), so that the verifier is not fitted to the known findings.

### Open — the owner's decisions

- The verifier model: the same as the finder, or a different one.
- The budget.
- Whether to switch `ai-review` off on `master` until then.

### Owner decision (2026-10-03): verifier design and budget

- **Main arm (option 3).** The judge (currently `anthropic/claude-sonnet-5`) receives code excerpts from the
  locations the finder's findings point at and, **before** grading, verifies every finding: a finding not
  confirmed by a quotation from the code is rejected and reaches neither the grading nor the comment. Finder:
  `openai/gpt-6-luna` @ `openai`, as in `finder-model-swap`.
- **Control arm (option 1).** The same luna verifies its own findings in a separate call ("quote the code
  that confirms the claim"); the judge is unchanged. Purpose: to learn whether an independent model is needed
  at all.
- **Option 4** (a separate strong verifier, e.g. `openai/gpt-6-sol`) stays in reserve and is not measured.
- **Budget for the whole change: $2.00 in total** (finder, verification, judge, grader, G5). **Stop and ask
  the owner once the total passes $1.60.**
- **The G3 hand-read threshold does not change** (≤ 5% rejected, unresolved counts as rejected, floor(0.05 × N)
  when N < 40) and is **computed on the PUBLISHED findings** (after verification).
- **Decided 2026-10-04** (see below): (a) cost criterion → R3, (b) verifier reasoning → R7, (c) `ai-review`
  off on `master` → R11.

Status: `new`. Per the owner (2026-10-03): `/rune-research` runs next (no paid model calls); `/rune-frame` and
`/rune-plan` do not run yet. `change.md` and `research.md` stay in carry, uncommitted.

### Owner decision (2026-10-04): R1–R13 on research.md's open questions

- **R1 Design (b).** A separate verifier call; the judge, its schema and its tests stay unchanged. CONTROL and
  MAIN share one implementation and differ only in the model id.
- **R2 Order.** CONTROL first; MAIN only if CONTROL fails a quality gate. A tooling failure or a measurement
  error is not a model failure. Before each series, the projected cost is checked against the remaining budget;
  a series whose estimate would take the total past $1.60 does not start without the owner's decision. The
  total budget stays $2.00.
- **R3 Cost.** G4 unchanged for the finder on the fixture rows. G4b: median total review cost per attempt
  (every finder, verifier and judge request) ≤ $0.063, separately for each PR series; an accepted limit based
  on the single measurement of #132. Incomplete cost telemetry fails the attempt. Zero verifier and zero judge
  timeouts in 10 attempts.
- **R4 Recall guard.** The fixtures' required metrics stay 3/3 computed on published findings. Before the
  seal the owner writes #240's known defects, each with an unambiguous detection criterion; the plan sets a
  PASS/FAIL condition on them (reporting which survived is not enough). If the list holds no known defect,
  #240 is not evidence that recall is preserved.
- **R5 Verdict states.** Only `confirmed` is published. `refuted`, `unsupported` and the code-assigned
  `unverifiable` are kept in review.json with their reason. The confirmation quote must be a verbatim
  substring of the delivered excerpt; that is a necessary condition, not proof that the claim is right.
- **R6 Excerpts.** The §7 policy, including call-site context. The plan sets exact, deterministic limits
  instead of "about 150 lines". Over a limit, or missing context the claim needs, means `unverifiable`. The
  free backcheck is re-run against the implemented policy before the seal.
- **R7 No reasoning** on either arm in this experiment. A reasoning variant is a separate construction that
  needs a new registration and the reserve case.
- **R8 No source root (changed from the recommendation).** Locally: an explicit pass-through with a warning
  and the status "verification skipped". In CI a missing source root aborts the review instead of publishing
  unverified findings. `offDiffFindingPaths` is computed on the pre-verification set.
- **R9 Unseen case.** #240 unseen, #247 reserve. Their inputs are frozen before the verifier prompt is
  written. Prompts, models, limits, criteria and the conditional arm order are sealed before the first
  measurement. The #240 result is not used to tune a later arm.
- **R10 Hand-read reuse on #269.** A D-row classification is inherited only when the dedup key and the claim
  both match; changed or new claims are classified again by the owner.
- **R11 `ai-review` off on master** by a separate small PR with a comment pointing at this change; restored
  together with the deployment of a finder that passed the gates.
- **R12 Jev (typesafe.ai) = option 4b, in reserve.** Raised by the owner on 2026-10-03 from a Codex note (Jev
  as the judge that verifies the finder's findings; research §9, Open Question 10). Not implemented or measured
  in this change. CONTROL, then possibly MAIN, come first. Jev needs its own decision on an API key, on sending
  code to a second provider, and on a confirmation criterion without a quotation.
- **R13 Judge latency.** A telemetry field is added; the measurement comes from the G4b series, with no
  separate paid calls.

### Owner decisions (2026-10-04): planning answers

Given during `/rune-plan` on 2026-10-04; they bind `plan.md` (Definitions).

- **G3 per PR.** G3 is judged separately for #269 and #240. For each PR, N is the number of published findings
  in the hand-read; the limit is floor(0.05 × N). Both PRs must pass. A pooled figure is reported for
  information only.
- **R4 rule.** Every known defect the finder raised in at least one valid #240 attempt must be kept in the
  published findings in ≥ floor(k/2)+1 of the k attempts in which the finder raised it. Every match needs the
  owner's approval. Defects never raised are reported as "not raised — no evidence about the verifier". If the
  finder raised no known defect, recall on #240 stays unproven and cannot be PASS. Whole-pipeline detection is
  a separate, informational metric.
- **Hand-read reuse.** MAIN's rows may inherit an owner classification from this change's CONTROL rows (as
  well as the #269 D-rows, R10) only when PR, code version, dedup key and the claim all match. The owner
  approves the match table; new or changed claims are classified again. CONTROL's labels may not be used to
  change MAIN's prompt or configuration before #240 is assessed. The judgement is inherited, not the
  observation: every published MAIN finding still counts in MAIN's own N and G3 result.
- **Restoring `ai-review`.** The plan removes the `false &&` line (R11's skip, `68151b0` on `master`) before G5.
- **Narrowing of R6 (plan-review F3, owner-approved 2026-10-04):** E5 removed; absence claims cannot be
  confirmed by quoting what is present; consistent with the 2026-10-03 testing ruling.
- **Refinement of R5's "verbatim" (plan-review re-run F4, owner-approved 2026-10-04):** a confirmation quote
  that is not an exact substring of its excerpt is compared a second time with every whitespace run collapsed
  to one space on both sides; token order must still match. Which comparison passed is recorded as
  `quoteMatch: "exact" | "whitespace"`. It is the sixth plan-chosen term the owner confirms at the seal.

### Owner decisions (2026-10-04): Phase 1 interpretations

Decided after Phase 1 (`2c4ae34`), before its impl review. No paid calls.

1. **Format repair** as a second, reformat-only model call (the finder's pattern, no `response_format`):
   approved. Its request reports through `onStepEnd`, so its cost counts toward G4b.
2. **Snapped units.** A unit snapped by name is included whole, the per-finding limit applies, and the same-file
   caller rule (E3) runs for it: approved.
3. **Unit grammar** also accepts `export default class`: approved; the Phase 3 unit-span check covers it.
4. **Directory-level claim** is `no-locator` before any read: approved.
5. **Verifier input.** Severity omitted: approved. The finder's suggested fix is **removed** from the verifier
   prompt (`suggestedFix` in `buildVerifierPrompt`): the verifier judges the claim (`description`) only, which
   is what the hypothesis, the hand-read and R10 reuse are about, and the suggestion would anchor luna on its own
   finding in CONTROL. The verification record keeps `suggestion`.
6. **Logging.** The stderr verification summary line and `verifier=(not run)` on the cost line: approved. For
   Phase 2, the incomplete-cost rule treats "verifier not called (nothing sent)" as complete and "verifier
   called, cost missing" as incomplete.

### Owner decisions (2026-10-04): after Phase 2

Reviewed with the ai-toolkit session at `fa5afaa`. No paid calls.

1. **2.3 confirmed.** In the G2 path the finder has one `withOneRetry` and `runVerificationPass` one for the
   verifier, with nothing wrapping either. `assertSeriesWritable` refuses an overwrite, a foreign series identity,
   and a re-run of a recorded or interrupted attempt (an interrupted attempt counts as failed).
2. **Narrowed F1 rule approved** instead of the literal one. "Every finding source-refused" is evaluated over the
   findings that cite a file of the diff (at least one required). Off-diff findings are refused by the allowlist
   by design and reported by `offDiffFindingPaths`. The Definitions row "No source root" and `gate.md` §3 say so.
3. **An incomplete verifier cost fails the fixture result**, as R3 applies it. It is a **cost failure like G4**,
   labelled `FAIL (cost)`, **not** a G3f quality failure, so it can never trigger MAIN: CONTROL ends
   `FAIL (cost)` and the owner decides. Recorded in `gate.md` §4–§5 and in the Definitions rows "Incomplete cost"
   and "Quality gate"; `promptfoo-gate-rows.mjs` labels it that way.
