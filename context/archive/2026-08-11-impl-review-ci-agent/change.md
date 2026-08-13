---
change_id: impl-review-ci-agent
title: Plan-aware implementation review in the AI-SDK review agent
updated: 2026-08-13
created: 2026-08-11
status: archived
archived_at: 2026-08-13T20:15:00Z
---

## Outcome

**Shipped and archived 2026-08-13.** All four phases plus two reliability fixes the work exposed.

| PR                                                               | What                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [#127](https://github.com/Piotr-Miller/lumina-clean-ai/pull/127) | Phases 1-4: plan resolution, the agent, pipeline/render wiring, pre-registered probe |
| [#131](https://github.com/Piotr-Miller/lumina-clean-ai/pull/131) | Post-merge verification (4.2, 3.14, 1.11, 4.1) via three scratch PRs                 |
| [#132](https://github.com/Piotr-Miller/lumina-clean-ai/pull/132) | Finder + judge cost instrumentation, closing 4.8                                     |
| [#133](https://github.com/Piotr-Miller/lumina-clean-ai/pull/133) | Cost gate: the pass runs only on a passing code review                               |

Every criterion in the plan's Progress ledger is checked. The phase-4 probe caught all three
injected deviations (MISSING, DRIFT, prohibited EXTRA) and correctly left the benign unplanned
helper at OBSERVATION — the pair that separates understanding exclusions from pattern-matching
"unplanned" — reproduced identically locally and in CI.

**The headline number: the pass costs ~9.47x the code review it rides alongside** ($0.199620 vs a
$0.021087 finder+judge baseline). That is why it is now gated behind a passing code review, and why
4.8 was written as a ratio rather than an absolute in the first place.

### Two things this work exposed in the EXISTING pipeline

- The judge's 120s budget was miscalibrated (the load is output, not input) and it had no envelope
  repair, on the reasoning that it "has never needed it". Four consecutive failures falsified that.
- Neither the finder nor the judge reported cost: the finder computed a per-step value and dropped
  it, and the judge had no usage accounting at all. 4.8 was uncomputable until that was built.

### Known open, deliberately not fixed here

- **The finder returns a degenerate finding set on security-saturated diffs** — 10/10
  `critical`/`security` on #127, versus a healthy spread on ordinary code (#128: 8 findings across
  4 categories and 3 severities). Diff-dependent, not a general defect. Fixing it means changing the
  finder prompt, which needs an eval run of its own.
- **The cost gate has never fired in production.** Every run since it shipped either passed its code
  review or resolved no plan.
- **The judge's envelope repair has never fired**, so only the timeout raise has evidence behind it.

## Notes

Give the AI-SDK review agent (`packages/code-reviewer`) the second half of the CI reviewer:
alongside the existing diff-only code review, an **implementation review** that judges the PR
against the plan it claims to implement. Seed: 10xDevs m5 lesson on `10x-impl-review-ci` —
"ścieżka 2" (agent składany), where the skill's SKILL.md mechanics are NOT reusable but its
criteria layer is.

**The load-bearing idea from the lesson: criteria are portable, mechanics are not.**
`.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md` (208 lines, present and
identical in both skill trees, and the one legitimately public file of that skill) is pure
agent-agnostic prose about _how to judge a diff against its plan_. It is reused as-is; only the
plumbing — where the plan comes from, where the verdict goes — is written here.

Three tools the lesson names, to be wired onto the existing `ToolLoopAgent`:

- `readPlan` — read `context/changes/<id>/plan.md`; accepts a change-id or a path; returns
  `{ found: false }` rather than throwing so the agent proceeds without one.
- `readImplReviewCriteria` — return the rubric above; called after `readPlan` returns `found: true`.
- `postPrComment` — publish the review to the PR via `gh` (the lesson notes the workflow's own
  comment step should then go away).

Loop shape: **STEP 1 always** — code review over the six criteria, then
`postPrComment({ kind: "code" })` unconditionally, even for a clean pass. **STEP 2 conditionally** —
implementation review only when the PR explicitly names a plan.

### Decisions the plan must settle (do NOT skip to code)

1. **Trust boundary.** `plan.md` lives on the PR **head** — attacker-controlled. This repo's
   standing rule is that trusted review rules come from the **base** branch only
   (`.github/ai-review-rules.md`). A plan cannot come from base by definition, so `readPlan` output
   must be fenced as untrusted data, never treated as instructions. Contrast with
   `readImplReviewCriteria`, which reads a base-controlled repo file and IS trusted.
2. **Who owns PR output.** Today it is deterministic: pipeline → `render.ts` → workflow upsert.
   Two safeguards were won in earlier impl-reviews and must survive a model-invoked
   `postPrComment`: the sticky upsert matches **only** our bot's comment (a pasted marker must not
   hijack the target), and the verdict label is **added before** the opposite is removed (a
   transient API failure must never leave the PR unlabelled). Also: never interpolate model text
   into a shell command — `--body-file`/stdin only.
3. **Gating and cost.** Always run the plan review, or only when code review is green? One
   reasoning model for both passes, or a cheap/expensive split? What is stripped from the diff
   before the agent sees it (lockfiles, configs)? The lesson leaves these open on purpose.
4. **Scope reversal to record.** `finder-file-context`'s plan listed "no readPlan / write-tools /
   git-show provider" under _What We're NOT Doing_, and its impl-review verified that guardrail
   held. This change deliberately reverses it.
5. **Sequencing with [[finder-tool-loop-evals]]** — **RESOLVED 2026-08-12** (merged `e8ebb66`,
   archived `context/archive/2026-08-10-finder-tool-loop-evals/`). Outcome: **no model change,
   `z-ai/glm-4.6` stays the finder.** Six models were evaluated and four live-probed; only
   `claude-sonnet-5` converted out-of-hunk context into a correct verdict on a real PR, at **57.6×**
   the cost per review, and that premium was declined. So there is no "cheap tool-capable model" to
   split onto — plan the model question as _closed_ unless this change is willing to re-open it and
   pay for its own live probe (~$0.15 of fixtures + one scratch PR; the bar is in that change's
   `decision.md`).

   **The load-bearing constraint this hands us — much harder than the earlier note suggested.**
   That note said "add more tools is not automatically the agent will use them", from 0 calls in
   4/4 runs. The evidence is now far stronger and generalizes past glm-4.6:

   - `z-ai/glm-4.6`: 0 tool calls on 0/6 tool-enabled fixture rows AND 0 live.
   - `z-ai/glm-5.2`: 0/6 — the successor inherits the blindness, so waiting for a newer Z.ai
     release is not a strategy.
   - `deepseek-v4-flash-0731`: fetched on **6/6** fixture rows and **0/3** live.
   - `claude-haiku-4.5`: delivered context on 3/3 fixture repeats; live it fetched the right file
     twice and never connected what it read.

   Consequence for this change's design: **`readPlan` cannot be a model-invoked tool if reading the
   plan is required.** A tool the model declines to call is indistinguishable from "no plan found",
   so STEP 2 would silently never run and the failure would look like a clean pass. Either resolve
   the plan deterministically in the plumbing and inject it into the prompt (fenced as untrusted,
   per decision 1), or accept that the implementation review is best-effort and make its
   non-execution _visible_ in the PR comment rather than silent. The same reasoning applies to
   `postPrComment` — if publishing depends on a model choosing to call it, a declined call means no
   comment at all, which contradicts the "STEP 1 always, even for a clean pass" requirement above.
   Only `readImplReviewCriteria` is safe as a model-invoked tool, because it is called _after_ a
   decision that has already been made deterministically.

   See also `lessons.md` → "An offline eval proves capability exists, not that it will be used".

Known interaction: committed review documents under `context/changes/**/reviews/**` get echoed
back by the finder as if they were current findings. Whatever this change does with plans, the
diff the finder sees should probably exclude that path.
