---
change_id: finder-security-vocabulary-bias
title: Finder returns a degenerate all-critical/security finding set on security-saturated diffs
status: preparing
created: 2026-08-13
updated: 2026-08-14
archived_at: null
---

## Notes

The code-review finder (`z-ai/glm-4.6`) collapses to a uniform
`critical`/`security` finding set when the diff it reviews is _about_ security —
mirroring the subject matter back as findings rather than analysing it.

### Evidence

Measured across seven captured runs of the real CI pipeline (artifacts, not
recollection):

| PR               | Diff character                      | Findings | Distribution                                                                                            |
| ---------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| #127             | prompt-injection defence work       | 10       | **10/10 `critical`/`security`**                                                                         |
| #127 (re-run)    | same                                | 10       | **10/10 `critical`/`security`**                                                                         |
| #128             | ordinary TS helpers (probe fixture) | 8        | 3 `minor/correctness`, 2 `minor/testing`, 1 `major/correctness`, 1 `minor/performance`, 1 `minor/style` |
| #132             | telemetry plumbing                  | 2        | 2 `nit/style`                                                                                           |
| #131, #133, #129 | docs / small                        | 0        | —                                                                                                       |

`preDedupFindingCount` was also 10 on #127, so this is not a dedup artifact —
the finder genuinely emitted ten uniform criticals.

**This is diff-dependent, not a general defect.** On ordinary code the
distribution is healthy across four categories and three severities. The failure
appears only when the reviewed code is saturated with security vocabulary
(fencing, untrusted data, `sanitizeInline`, symlink gates, path traversal).

### Why it matters

Two distinct harms, and the second is the expensive one:

1. **Signal loss.** #127's scorecard read `verdict=failed` on ten findings that
   were largely restatements of what the code was _for_. A reviewer cannot act on
   that, and a reviewer who learns to ignore it stops reading the real ones.
2. **It broke the pipeline.** Ten criticals forced the judge to write six long
   justifications, and that generation is what exceeded the judge's budget and
   produced four consecutive `AI_NoObjectGeneratedError` failures on PR #127
   (runs 31707888975 + re-run). The judge timeout raise and envelope repair
   shipped as mitigations; this is the upstream cause.

Same family as the known bug that committed review documents get echoed back as
current findings — which is why `**/reviews/*.md` is already stripped from the
reviewed diff.

### Why this is its own change and not a patch

The fix is a **finder prompt change**, and the finder reviews every PR in this
repo. `lessons.md` is explicit that an offline eval proves capability exists, not
that it will be used, and `finder-tool-loop-evals` established the expensive
version of that rule. So:

- The `code-review-evals` promptfoo harness (`packages/code-reviewer/evals/`)
  already exists and is the instrument that must hold any fix honest.
- **No fixture currently reproduces this.** Adding a security-saturated fixture
  that reproduces the 10/10 collapse is the first deliverable — a fix cannot be
  evaluated against a bug the eval set does not contain.
- The regression risk runs the other way too: an instruction like "do not infer
  vulnerability from subject matter" could suppress _genuine_ security findings
  on genuinely insecure code. The eval set must cover both directions before any
  prompt text changes.

### Do NOT

- Do not tune the finder prompt against #127 alone. One diff is an anecdote, and
  the failure mode is exactly the kind that fixture-fits.
- Do not treat a model swap as the first option. `finder-tool-loop-evals` closed
  that question on cost evidence (sonnet-5 at 57.6x); re-opening it needs its own
  live probe and its own budget.

### Research outcome (2026-08-14) — three premises above are WRONG

See `research.md`. Corrections to what is written above, kept rather than edited
away so the reasoning stays auditable:

1. **Reproduces offline: YES**, on the real #127 diff run locally, tool-less —
   2 of 8 runs produced the exact CI signature. No fixture needed to see it.
2. **"10/10 critical/security" is too narrow a framing.** The invariant is
   **severity monotony** — one severity for a whole run — and it holds on an
   ordinary-code CONTROL diff too (6/8 runs, all `nit`). Subject matter selects
   the _value_, not the monotony. The "healthy spread on ordinary code" claim
   above came from a single CI run of #128; with repeats, ordinary code is also
   monotone.
3. **It is intermittent** (2/8 full collapse, 4/8 all-critical, 2/8 fine), so it
   is a distributional defect. A single fixture row cannot detect it.
4. **The most promising mechanism was REFUTED for ~$0.02.** The trusted
   project-rules file — which holds the only instruction-level "critical" the
   finder ever sees — is _not necessary_: removing it entirely still produced a
   full collapse (1/5).
5. **The eval harness cannot grade this even with a fixture.** `category` is read
   by zero assertions; severity is only ever "is any finding critical/major?". A
   distribution metric has to come first.

### Revised direction

The prompt is probably the wrong surface. `lessons.md` now records three cases in
this package where a prompt fix failed and a structural one worked, and the one
prior direct attempt on the _finder's_ prompt (`09e6e03`) changed nothing at all
under glm-4.6. The finder's `severitySchema` has no calibration, no ceiling, and
no orthogonal pressure valve — unlike the judge's anchored score and the impl
reviewer's severity/impact pair. That is the likely fix surface.

### Next step

**Exclude the null hypothesis before building anything** — read the findings from
a collapsed run and check whether they are genuinely security-class and
critical-class, looking specifically for mislabelled correctness/testing gaps. It
is free, and it decides whether this change has a subject at all. Then
`/10x-plan`, whose first deliverable is the distribution metric, not a fixture.

### Reference

Captured artifacts and the diagnosis chain live in
`context/archive/2026-08-11-impl-review-ci-agent/` (Outcome section) and the
run URLs above.
