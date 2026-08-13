---
change_id: finder-security-vocabulary-bias
title: Finder returns a degenerate all-critical/security finding set on security-saturated diffs
status: new
created: 2026-08-13
updated: 2026-08-13
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

### Next step

`/10x-research finder-security-vocabulary-bias` — establish whether the collapse
reproduces offline in promptfoo at all, since a bug that only appears live is a
different (harder) change than one a fixture can pin.

### Reference

Captured artifacts and the diagnosis chain live in
`context/archive/2026-08-11-impl-review-ci-agent/` (Outcome section) and the
run URLs above.
