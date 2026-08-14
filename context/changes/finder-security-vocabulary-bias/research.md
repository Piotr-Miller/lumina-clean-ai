---
date: 2026-08-14T13:57:32+02:00
researcher: Piotr Miller
git_commit: a7b9cce4f5fb41c9b49f0c8ddf22d1737ed59725
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "Does the finder's degenerate all-critical/security finding set reproduce offline, and what causes it?"
tags: [research, codebase, code-reviewer, finder, evals, glm-4.6, structured-output]
status: complete
last_updated: 2026-08-14
last_updated_by: Piotr Miller
---

# Research: finder-security-vocabulary-bias

**Date**: 2026-08-14T13:57:32+02:00
**Researcher**: Piotr Miller
**Git Commit**: `a7b9cce4f5fb41c9b49f0c8ddf22d1737ed59725`
**Branch**: `master`
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

From `change.md`: _establish whether the collapse reproduces offline in promptfoo at all, since a bug
that only appears live is a different (harder) change than one a fixture can pin._

## Summary

**It reproduces — but three of this change's founding premises are wrong, and the fix surface it
assumed is not where the bug lives.**

1. **Reproduces outside CI: YES.** Running the real finder locally against #127's actual diff,
   tool-less, produced the exact CI signature (100% `security`, 100% `critical`) in **2 of 8 runs**.
   No promptfoo fixture is needed to see it; the live diff is enough.
2. **It is intermittent, not deterministic** — 2/8 full collapse, 4/8 all-`critical` with mixed
   categories, 2/8 not degenerate. So it is a **distributional** defect. A single fixture row cannot
   detect it; only repeats plus an aggregate metric can.
3. **The framing "all critical/security" is too narrow.** The invariant is **severity monotony** —
   one severity for the entire run — and it holds on the CONTROL diff too (6/8 runs). What changes
   with subject matter is _which_ severity it collapses to: `critical` on security code, `nit` on UI
   code. `change.md`'s "healthy spread on ordinary code" was inferred from a single CI run of #128;
   with repeats, ordinary code is also monotone.
4. **The leading mechanism was refuted, cheaply.** The most promising candidate was the trusted
   project-rules file injected at the tail of the finder's system prompt — it holds the only
   instruction-level use of the word "critical" the finder ever sees. Removing it entirely **did not
   prevent the collapse** (full collapse still occurred, 1/5).
5. **The eval harness cannot currently measure this even with a fixture.** `category` is read by
   **zero** assertions; severity is only ever reduced to "is any finding critical/major?". Adding a
   fixture is necessary but insufficient — a new distribution metric is required first.
6. **Prompt-text fixes are the wrong instrument on this model, on recorded evidence.** The one prior
   direct attempt to strengthen the finder's prompt produced no behavioural change at all, and the
   two most recent analogous bugs in this package were both fixed structurally in the schema after
   prompt attempts failed.

Net redirection: this is most likely a **schema-calibration** change (the finder's severity enum has
no anchors, no ceiling, no orthogonal pressure valve), not a prompt-wording change — and the eval
harness needs a distribution metric before any fix can be graded.

## Detailed Findings

### 1. Offline reproduction (the research question)

Instrument: `packages/code-reviewer/scripts/finder-distribution.mjs` (added by this research). It
reconstructs a historical PR's reviewed diff the way `review.yml` does — including the 100 KB
`DIFF_CAP_BYTES` cap — and runs the real `createReviewer` tool-less, matching the observed CI
behaviour where the finder was offered `getFileContext` and made zero calls.

Matched pair rather than a repeat of the failing case:

| Arm       | Commit           | Subject                  | Raw diff   | Sent (capped) |
| --------- | ---------------- | ------------------------ | ---------- | ------------- |
| TREATMENT | `7c9c12f` (#127) | prompt-injection defence | 265,417 ch | 99,460 ch     |
| CONTROL   | `2ba0ce4` (#86)  | enhance UI refresh       | 233,494 ch | 99,520 ch     |

The control is deliberately **not** another `packages/code-reviewer` diff: that package's own source
is saturated with security vocabulary by nature, which would confound subject matter with the variable
under test.

**TREATMENT, 8 runs** (`sec%` = share of findings with `category: security`; `crit%` = share
`critical`):

| Run | n   | cats  | sevs  | sec%    | crit%   | distribution                                                                |
| --- | --- | ----- | ----- | ------- | ------- | --------------------------------------------------------------------------- |
| 1   | 10  | 4     | 1     | 60      | **100** | `{security:6, correctness:1, documentation:2, testing:1}` / `{critical:10}` |
| 2   | —   | —     | —     | —       | —       | **FAILED** `AI_NoObjectGeneratedError: response did not match schema`       |
| 3   | 5   | 3     | 1     | 20      | **100** | `{security:1, testing:3, documentation:1}` / `{critical:5}`                 |
| 4   | 7   | 3     | 2     | 29      | 29      | `{critical:2, minor:5}`                                                     |
| 5   | 7   | 5     | 1     | 43      | **100** | `{critical:7}`                                                              |
| 6   | 9   | **1** | **1** | **100** | **100** | `{security:9}` / `{critical:9}` ← **CI signature**                          |
| 7   | 8   | **1** | **1** | **100** | **100** | `{security:8}` / `{critical:8}` ← **CI signature**                          |
| 8   | 1   | 1     | 1     | 0       | 0       | `{documentation:1}` / `{nit:1}`                                             |

**CONTROL, 8 runs**: `n` ∈ {0, 0, 0, 3, 5, 5, 7, 8}; `security` share 0% in 7 of 8 (one run 38%);
`critical` share **0% in all 8**; `sevs=1` in 6 of 8, always `nit`.

Conclusions from this data:

- **The collapse reproduces offline** (runs 6 and 7 are indistinguishable from the CI artifact).
- **Subject matter drives the severity value, decisively.** `critical` share: treatment 0–100%
  (five of eight runs at 100%); control **0% in every run**. That contrast is unambiguous even at
  this sample size.
- **Security-category inflation is real but variable** on the treatment (0, 20, 20, 29, 43, 60, 100, 100) and near-absent on the control.
- **Finding count is wildly non-deterministic** on both arms, including three zero-finding runs on the
  control. Any future metric must be robust to that.

### 2. Severity monotony is the invariant — and it is not security-specific

`sevs=1` occurred in 7 of 8 treatment runs and 6 of 8 control runs. The finder overwhelmingly emits
**one severity for an entire review**. What subject matter changes is the value it lands on.

This reframes the bug. It is not "security code produces security findings" (which would be
defensible); it is "**the finder does not discriminate severity within a run at all**, and the single
value it picks is anchored by the diff's vocabulary." On a security diff that anchor is `critical`,
which is what makes the output useless — ten indistinguishable criticals convey no ranking.

It also explains the downstream damage recorded in `change.md`: ten criticals is what forced the judge
into the long generation that produced four consecutive failures on #127.

### 3. Mechanism candidates — one refuted, one strengthened

**REFUTED: trusted project-rules injection.** `prompts.ts:54-56` appends
`.github/ai-review-rules.md` as the **last** element of the instruction array (and `prompts.ts:57`
joins with `" "`, so it occupies the recency-privileged tail). The file is 2,929 bytes against a
10,000-char cap (`pipeline.ts:372`), so it is injected whole. Read as prompt text it is a strong
suspect:

- `ai-review-rules.md:8` — header is `## Hard rules (violations are findings)`
- security rules occupy bullets **1, 2 and 4** (`:10-13` RLS, `:14-17` IDOR, `:22-24` secrets)
- `ai-review-rules.md:54` — "any change setting it in production config **is a critical finding**"
  — the **only** instruction-level occurrence of the word "critical" anywhere the finder can see.
  `buildInstructions` never defines severity tiers at all.

That is token-activated: inert on ordinary diffs, live on security diffs — the only candidate that
explains topic-dependence. **Tested by A/B** (`CONTEXT=none`, a supported production configuration
since `--project-context-file` is optional), 5 runs on the treatment diff:

| Run | n   | cats  | sevs  | sec%    | crit%   |
| --- | --- | ----- | ----- | ------- | ------- |
| 1   | 14  | 5     | 1     | 14      | **100** |
| 2   | 5   | 5     | 3     | 20      | 20      |
| 3   | 15  | **1** | **1** | **100** | **100** | ← **full collapse with no rules at all** |
| 4   | 10  | 4     | 1     | 20      | 0       |
| 5   | 6   | 4     | 3     | 33      | 33      |

**The rules file is not necessary for the collapse.** One counterexample suffices to refute necessity.
Whether it raises the _frequency_ is not measurable at n=5 vs n=8 (full collapse 1/5 without vs 2/8
with) and should not be claimed either way.

Two incidental observations from the no-context arm, both weak at this n: severity spread `sevs=3`
appeared twice (never seen with context, max 2), and finding counts rose (14, 15). If anyone revisits
this, those are the threads.

**STRENGTHENED: the finder's severity/category enums carry no calibration.**

- `schemas.ts:46` — `severitySchema.describe("How bad the issue is if left unfixed")`. A restatement
  of the field name. Nothing distinguishes `critical` from `major`, nothing reserves `critical`, and
  nothing suggests a distribution.
- `schemas.ts:47` — `categorySchema.describe("Which review dimension the issue belongs to")`.
  Likewise no tie-break, so a genuine _correctness_ or _testing_ gap sitting in security-related code
  has nothing steering it away from `category: "security"`.
- Declaration order puts `critical` first (`schemas.ts:9`) and `security` first (`schemas.ts:17-24`);
  `z.toJSONSchema` preserves that order, and first-listed enum members are a known decoding attractor.
- **No pressure valve and no cap.** The impl-review pass has an orthogonal `impact` axis
  (`schemas.ts:341`) that absorbs "this matters a lot" without inflating severity, plus a stated
  10-finding cap enforced in code (`impl-reviewer.ts:24,69`). The finder has neither; `mergeFindings`
  (`findings.ts:43-58`) only dedups and sorts.

The contrast **inside the same file** is the strongest argument: the judge's `score` field was given
explicit anchors this week (`schemas.ts:88`, "Score from 1 (worst outcome) to 10 (best outcome)")
precisely because a constraint carried by prose alone was not honoured. The finder's severity enum
never received that treatment.

**Not the mechanism: the finder's own security vocabulary.** The phrases "injection risks", "missing
authorization … at trust boundaries", "secrets in code" live only in the `security` entry of
`lensFocus` (`prompts.ts:9-10`), and production **never selects that lens**: `reviewer.ts:117`
defaults to `general`, `pipeline.ts:369-379` passes no lens, `cli.ts:48-75` has no `--lens` flag, and
`action.yml:97` passes none. The `general` text (`prompts.ts:7-8`) names security first of four and
omits `testing`/`documentation`, which is a weak, **topic-independent** nudge — it cannot explain a
distribution that changes with subject matter.

**Also not available as an explanation: PR metadata priming.** The finder never sees the PR title or
body — `buildPrompt` (`prompts.ts:232-249`) takes only the review unit; metadata goes to the judge
(`pipeline.ts:415`). "This PR is about security" can reach the finder only as diff content.

### 4. A partial measurement artifact exists, but cannot be the whole story

Two of our own code paths inflate the _surfaced_ distribution:

- `render.ts:213-217` sorts by severity descending and slices to `MAX_RENDERED_FINDINGS = 5`
  (`render.ts:16`), so any distribution read off `comment.md` is critical-first by construction.
- `mergeFindings` dedups on `file:line|category` keeping the **higher** severity
  (`findings.ts:46-51`), ratcheting severity upward within a category.

These are ruled out as the explanation for #127 specifically: that run's `review.json` recorded
`preDedupFindingCount: 10` against `findings.length: 10` — no collapse occurred — and the 10/10 was
read from `review.json`, not the comment. My local runs read the same field. The artifact remains a
real caution for anyone measuring this from rendered output.

### 5. The eval harness cannot grade this yet

- **No fixture has security/hardening subject matter.** Three fixtures exist
  (`react-migration.diff`, `cross-hunk.diff`, `clean-change.diff`) plus an inline canary. The only
  security content anywhere is an XSS _defect planted inside a refactor_
  (`react-migration.diff:86`) — a security bug under review, not a hardening change under review.
- **`category` is read by zero assertions.** It appears once in the whole harness: the enum in
  `review-result.schema.json:19-21`. Nothing counts categories or ratios them.
- **Severity is only ever a boolean.** `reviewMustFail` (`assertions.mjs:8-36`) asks "is the worst
  severity critical-or-major?"; `reviewMustPass` (`:42-79`) asks "are zero findings critical-or-
  major?". No histogram, no spread requirement.
- **Finding count is computed and discarded** — `reviewMustPass` puts it in a reason string
  (`assertions.mjs:68`) and throws it away.
- The JSON schema cannot express it either: plain `type: array`, no `minItems`/`contains`, and it must
  stay draft-07 (`evals/README.md:102`).

Two precedents make a distribution metric mechanically cheap, though: `countToolCalls`
(`assertions.mjs:118-142`) proves a `javascript` assertion may return an **arbitrary numeric score**
that promptfoo averages as a named metric, and `scoreIssueRecall`/`requireToolContext` prove a
per-case knob can travel in `context.vars`. Wiring constraints to respect:
`promptfooconfig.test.ts:82-108` pins grader↔var pairing, and `:86-88` keeps `scoreIssueRecall` off
`defaultTest` because promptfoo **prepends** default asserts to every case.

Also relevant: the harness makes **real paid calls with no dry-run mode**
(`finder-provider.ts:185-205`; `config.ts:76-79` throws without a key). Full matrix ≈ $1.50–2.00,
filtered rounds $0.08–0.63 (`evals/README.md:57-77`).

### 6. Prompt-text fixes have a bad record on this exact model

- **The one direct attempt failed.** Commit `09e6e03` spelled out the concrete tool-trigger class in
  the finder's instruction after a generic sentence produced nothing. Outcome: still **0 tool calls**
  — 0/6 tool-enabled fixture rows in each of two matrices, 0/3 in a probe, 0 live
  (`finder-file-context/verification.md:41`; `finder-tool-loop-evals/decision.md:70-86`, which states
  outright that "prompt strengthening did not move it").
- **The two most recent analogous bugs were fixed structurally, after prompt attempts failed.**
  `lessons.md:166-171` records impl-review anchoring at 0/10 with two failed prompt fixes, resolved
  only by making the field required in the schema; `lessons.md:180-185` records the follow-on provider
  wall. The judge's score range was moved out of an invisible `.refine()` into a schema enum for the
  same reason (this week, PR #142).
- **Standing repo position**: "Not changing models or prompts to reduce the flake rate — that's evals
  territory" (`2026-08-08-review-pipeline-reliability/plan.md:74-75`).

### 7. New finding: the finder also hits schema mismatch on this diff

Treatment run 2 failed with `AI_NoObjectGeneratedError: response did not match schema` — **1 in 8 runs
on this input** — despite the finder having envelope repair (`tolerantReviewOutput`,
`reviewer.ts:146`). The repair did not rescue it, so the drift was not the wrapped-envelope class
`output-repair.ts` handles. This is the same failure class fixed for the judge in PR #142 and is
recorded here because it is a second, independent instance of the same pattern and was not previously
known to affect the finder. It is **out of scope for this change** but should not be lost.

## Code References

- `packages/code-reviewer/src/prompts.ts:6-17` — `lensFocus`; `:7-8` the production `general` text
- `packages/code-reviewer/src/prompts.ts:33` — "Report only issues worth fixing; do not pad the list"
  (the only brake; constrains quantity, never distribution)
- `packages/code-reviewer/src/prompts.ts:54-57` — trusted `projectContext` appended last, joined into
  one paragraph
- `packages/code-reviewer/src/schemas.ts:9,17-24` — severity/category enum declaration order
- `packages/code-reviewer/src/schemas.ts:46-47` — the uncalibrated `.describe()` text
- `packages/code-reviewer/src/schemas.ts:88` — the judge's anchored score, the precedent to copy
- `packages/code-reviewer/src/schemas.ts:341` — `implImpactSchema`, the pressure valve the finder lacks
- `packages/code-reviewer/src/findings.ts:43-58` — `mergeFindings`, no cap, keeps higher severity
- `packages/code-reviewer/src/render.ts:16,213-217` — severity-descending slice to 5
- `packages/code-reviewer/src/reviewer.ts:117` — production lens defaults to `general`
- `packages/code-reviewer/evals/assertions.mjs:8-36,42-79` — severity as a boolean
- `packages/code-reviewer/evals/assertions.mjs:118-142` — `countToolCalls`, the numeric-metric precedent
- `.github/ai-review-rules.md:8,54` — "violations are findings"; the lone "critical finding" anchor
- `.github/workflows/review.yml:164-177` — the `**/reviews/*.md` exclusion and its reasoning
- `packages/code-reviewer/scripts/finder-distribution.mjs` — the instrument built for this research

## Architecture Insights

**The recurring failure shape in this package, now seen four times.** A constraint that must hold at
generation time is placed somewhere the model cannot act on — an optional schema field, an invisible
`.refine()`, or prose in the instructions — and the layer that _can_ enforce it is left silent. It has
now appeared as: impl-review anchoring (optional field, `lessons.md:166`), the judge's score range
(invisible refine, PR #142), the `oneOf` incompatibility (`lessons.md:180`), and now the finder's
severity enum (uncalibrated describe). In every resolved case the fix was structural and the prompt
fix had already failed.

**Severity is the one grading axis in this system with no calibration anywhere.** The judge has a
6-criterion rubric with per-score anchors; the impl reviewer has severity/impact definitions and a
cap; the finder has a four-value enum and a one-line restatement. It is the least-specified and most
consequential field in the pipeline — it drives the labels, the render order, and the judge's workload.

**The review-docs-echo precedent does not transfer.** Excluding `**/reviews/*.md` worked because
review prose is metadata _about_ a past review, so dropping it costs nothing. Security-relevant code
_is_ the thing under review; there is no subset you can drop and still have reviewed it.

## Historical Context (from prior changes)

- `context/archive/2026-08-09-code-review-evals/plan.md:5,27,51` — the eval matrix design: four models
  × two cases × `--repeat 3`, neutral Gemini grader, rubrics scoring _concept identification, not
  severity/category agreement_. Severity calibration was **explicitly out of scope** from the start.
- `context/archive/2026-08-09-code-review-evals/results/2026-08-10-first-matrix.json` — re-derived
  per-row distributions across 30 glm rows in three committed matrices: **never** a uniform
  all-`critical`/`security` set. Independent corroboration that no fixture reproduces this.
- `context/archive/2026-08-10-finder-tool-loop-evals/decision.md:70-86` — glm-4.6 "competent, and
  structurally blind"; **prompt strengthening did not move it**. `:352-359` — the 57.6× sonnet-5
  premium, matched-baseline on one diff, declined. `:313-318` — `glm-5.2` inherits the blindness, so
  waiting for a successor is not a strategy.
- `context/archive/2026-08-10-finder-tool-loop-evals/decision.md:74-78` — what glm is good at, which
  constrains any fix that trades it away: "the **most schema-reliable model in the matrix**".
- `context/archive/2026-08-10-finder-file-context/verification.md:101-102` — how the review-docs echo
  was discovered, and that it came back **at critical severity**.
- `context/foundation/lessons.md:159-164` — offline evals prove capability, not use; deepseek 6/6
  fixtures → 0/3 live. Directly constrains how far a fixture win can be trusted here.

## Related Research

- `context/archive/2026-08-09-code-review-evals/research.md` — the glm schema-flake hypothesis that
  did not reproduce
- `context/archive/2026-08-11-impl-review-ci-agent/verification.md` — the pre-registration discipline
  this change should reuse

## Open Questions

1. **The null hypothesis has not been excluded, and it is the cheapest next step.** Nobody has _read_
   the ten findings from a collapsed run to ask whether they are genuinely security-class and
   genuinely critical-class. If a security-hardening PR legitimately yields a security-heavy set, the
   premise weakens considerably. Test by reading, not measuring — and specifically look for
   **mislabelling**: findings whose text describes a correctness, testing or documentation gap but
   carry `category: "security"`.
2. **Does the severity monotony pre-date the collapse, or cause it?** `sevs=1` holds on both arms. If
   the finder simply cannot vary severity within a run, then "all critical" on security code is a
   symptom of a general defect rather than a security-specific one — and the fix target changes from
   "security bias" to "severity discrimination".
3. **Would a severity anchor actually move it?** The judge's `score` anchor is one week old and
   unvalidated over repeats; the impl-review `locus` fix worked but was a _required field_, a stronger
   intervention than a `.describe()`. Cheapest test: add anchors to `severitySchema.describe()` and
   re-run this instrument's treatment arm at n≥8.
4. **Does enum reordering matter?** Putting `minor` first and `critical` last is a one-line change and
   directly tests the decoding-attractor hypothesis.
5. **Frequency contribution of the rules file** — refuted as necessary, unmeasured as contributory.
   Needs n≥20 per arm to say anything, at ~$0.004/run.
6. **What metric should grade this?** Candidate: a `javascript` assertion returning
   `distinctSeverities / min(findings.length, 3)` as a named metric, plus a hard fail when
   `findings.length >= 5 && distinctSeverities === 1`. Must be off `defaultTest`
   (`promptfooconfig.test.ts:86-88`) and must not punish legitimate zero-finding rows.
7. **Is the finder's 1-in-8 schema mismatch (§7) the same drift the judge had?** Out of scope here,
   but it wants its own capture of `error.text`.
