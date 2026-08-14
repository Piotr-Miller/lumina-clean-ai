# Decision — Finder Precision on Hardening Diffs

- **Change**: `finder-security-vocabulary-bias`
- **Date**: 2026-08-14
- **Outcome**: **INVALID-FIXTURE** — read off the pre-registered gate, no renegotiation
- **Intervention attempted**: none. Phase 3 never started, which is what the gate is for.

## What was measured

| Count              | Result      | Pre-registered meaning                               |
| ------------------ | ----------- | ---------------------------------------------------- |
| `fabrication_runs` | **0 of 20** | `≤ 1` → INVALID-FIXTURE, immediately                 |
| `usable_output`    | 20 of 20    | no reliability concern to weigh                      |
| `guard_reported`   | 10 of 20    | not part of the validity gate — see the side finding |

`verification.md` was committed at 21:16:00 UTC; the run is stamped 21:28:30 UTC. The bar provably
predates the number, which is the only thing that makes reading it off meaningful.

## The finding: the fixture does not reproduce the defect

Zero fabricated absence claims in twenty runs on a diff purpose-built to provoke them — defences
present, commented, and of exactly the kind #127 hallucinated away. Adding the earlier matrices, that is
**50 rows without a single fabrication** on synthetic fixtures, against 2 of 8 on the real #127 diff.

The live pipeline says the same thing. PR #143's own review (run `31841839498`) returned **7 findings,
all `nit`, zero fabrications** on a diff full of `logSafeKey`, `OBJECT_KEY`, control-character
stripping, anchored allowlists and traversal rejection.

### The change's founding hypothesis is not supported

The change is named for the theory that security-saturated subject matter triggers the collapse. Three
independent results now stand against it:

1. Research found the same **severity monotony on an ordinary-code CONTROL diff** (6/8 runs, all `nit`)
   — so monotony is not specific to security content.
2. The eval found **0/20** fabrications on a purpose-built hardening fixture.
3. The live pipeline found **0** on a real hardening PR.

"The diff is about security" is not a sufficient condition for the collapse. That is a real result, and
it is the reason the fabrication question is being handed to research rather than to another fixture
attempt: we do not know which property of the real diff matters, and guessing at synthetic variants is
how this change would burn its next budget.

## Side finding, which became the more valuable one

`guard_reported = 10/20` was built as an over-suppression guard for an intervention that never shipped.
As a baseline it measured something else entirely.

Reading the ten failures: the finder usually **does** notice the unvalidated key — one row says _"could
lead to directory traversal"_ verbatim — and files it as `minor`. The misses are **severity
calibration, not detection**. A real, indisputable cross-user path traversal is under-graded in half of
runs.

That is the layer this change explicitly deferred, and the baseline caught it by accident with an
instrument that already exists and demonstrably works.

## Disposition

**1. The instrument ships.** Both fixtures, the two deterministic graders (`requireDefectReported`,
`scoreEvidenceFidelity`) and the `no_fabricated_absence` rubric gate stay on the branch. They document
the defect independently of any fix, and the vulnerable fixture is the measuring device the follow-up
below depends on.

**2. Severity calibration becomes the next change** — the actionable half of what was learned. Scoped
narrowly, per the fork decision:

> **Ensure detected cross-user authorization-boundary violations cannot be classified as `minor`.**

It starts from a recorded baseline of **10/20**, reuses the existing vulnerable fixture, tightens the
severity rubric and its examples, and reruns the same sample. Target **20/20 non-minor**, with an
explicit counter-check that ordinary validation bugs are **not** inflated in exchange — the obvious
failure mode of any severity-raising change, and the direct analogue of the over-suppression guard.

Chosen over chasing a better fabrication fixture because it is measurable today, the impact is higher
(a fabricated finding costs a reviewer's attention; an understated authorization risk may simply be
skipped), and success does not depend on first discovering an unknown property of the real diff.

**3. Fabrication becomes a research follow-up, not a fixture attempt.** The order matters: first
characterize which properties of a real diff trigger the collapse — size, file count, genuine
ambiguity, the presence of committed review prose, position in a truncated diff — and only then design
a representative fixture. This change's evidence says a synthetic hardening diff is not it, and that
50-row negative is the useful thing to carry forward.

## What this change does not claim

- Not that the finder no longer fabricates. #127 is captured evidence that it does; four of its ten
  findings were contradicted by the code they cited.
- Not that the rubric gate is proven at scale. It graded 20 rows correctly against a hand-read
  (criterion 2.6, 0 misgrades), and the fixture and rubric are both mine, so that read is not fully
  independent.
- Not that `guard_reported = 10/20` is a calibrated production rate. It is one fixture, twenty runs,
  one model — enough to justify the next change, not to size the problem.
