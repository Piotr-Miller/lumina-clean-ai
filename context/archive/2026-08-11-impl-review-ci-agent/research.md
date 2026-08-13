---
date: 2026-08-12T11:45:52Z
researcher: Piotr Miller
git_commit: be6cd6ab6efb3dc67668b45a3aef2c06415d5a67
branch: docs/impl-review-ci-agent-scoping
repository: Piotr-Miller/lumina-clean-ai
topic: "Plan-aware implementation review in the AI-SDK review agent — trust boundary, tool determinism, gating"
tags: [research, codebase, code-reviewer, ci, prompt-injection, agent-tools, spec-driven]
status: complete
last_updated: 2026-08-12
last_updated_by: Piotr Miller
---

# Research: Plan-aware implementation review in the AI-SDK review agent

**Date**: 2026-08-12T11:45:52Z
**Researcher**: Piotr Miller
**Git Commit**: `be6cd6ab6efb3dc67668b45a3aef2c06415d5a67`
**Branch**: `docs/impl-review-ci-agent-scoping`
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

How should `packages/code-reviewer` gain a second, plan-aware pass that judges a PR against the plan
it claims to implement — specifically the four decisions `change.md` says the plan must settle
(trust boundary, ownership of PR output, gating/cost, and the tool split), weighted toward the trust
boundary, and informed by external research on CI agent security, prior art, and the AI SDK.

## Summary

Five findings, in descending order of how much they should change the plan.

1. **The reusable criteria layer contains two sections that cannot cross into CI unchanged.**
   `impl-review-instructions.md` mandates _running_ the plan's automated verification commands. In
   CI those commands come from an attacker-controlled file. Porting them verbatim is remote code
   execution in a job holding `OPENROUTER_API_KEY` and a `pull-requests: write` token. "Criteria are
   portable, mechanics are not" is right, but §3.4 and § "Verify the success criteria" are
   _mechanics wearing criteria clothing_.

2. **Plan discovery is already solved, deterministically, in shell** — inside the very skill whose
   mechanics `change.md` calls non-reusable. It should be lifted into the workflow as a step, not
   converted into a model-invoked `readPlan` tool.

3. **`postPrComment` as a model tool would violate the "Agents Rule of Two"** as published by
   Microsoft's Defender research team two months ago, and would hand a model the one capability this
   pipeline currently keeps deterministic and twice-hardened.

4. **Prior art converges independently on the same shape**: Spec Kit's CI Guard, Canon and Sigil all
   do plan/spec-vs-code conformance on PRs, and all of them keep the harness deterministic and
   read-only, with the _tool_ posting the comment rather than the model.

5. **The AI SDK does offer a way to force a tool call** (`toolChoice: 'required'`, and per-phase
   `prepareStep`), which partially answers `change.md` §5's worry. But forcing a call does not force
   _good use of the result_ — this repo has direct evidence of a model fetching the right file and
   still missing the point — and it does not touch the security argument against `postPrComment`.

## Detailed Findings

### 1. The criteria layer is portable — except where it isn't

`.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md` is 208 lines and opens by
declaring its own boundary (`impl-review-instructions.md:5`):

> "This document assumes you already have both inputs in hand — the plan's content, and the
> implementation as a set of changed files. It does **not** cover how to find the plan, compute a
> diff, read files, run a harness, or publish results."

That is exactly the contract this change needs, and it independently supports the
resolve-the-plan-deterministically design: the criteria layer _expects the plan to arrive already in
hand_. Its judgment content — the four-verdict drift model (`MATCH / DRIFT / MISSING / EXTRA`), the
seven dimensions, the severity×impact grammar, the fix-options template — is pure prose and ports
as-is.

**Two sections do not port.** Dimension 3, step 4 (`impl-review-instructions.md:87`):

> "**Run the plan's automated test commands.** Run each test-related command and capture its exit
> code. Non-zero → **FAILING TEST** (severity FAIL)."

and § "Verify the success criteria" (`impl-review-instructions.md:95`):

> "run the plan's remaining Automated Verification commands — lint, build, format-check, typecheck."

In the interactive skill a human is present and the plan is local. In CI the plan is on the **PR
head**. A PR can therefore contain, under Automated Verification, any string it likes, and a
faithful port would execute it. This is not hypothetical: `plan.md` is a markdown file with
`` - [ ] `command` `` checkboxes, and extracting-then-running them is precisely what the criteria
say to do.

The existing workflow's guards reduce but do not remove this: `review.yml:24` restricts to same-repo
PRs and `review.yml:27` skips bot authors, so the adversary must be someone who can already push a
branch. That is a meaningfully smaller threat model than fork PRs — but "a branch author can run
arbitrary commands in a job holding the OpenRouter key" is still a privilege escalation, and it is
not what a _review_ should be able to do.

### 2. Plan discovery already exists, deterministically, in shell

`.claude/skills/10x-impl-review-ci/SKILL.md` Step 0 resolves the plan without any model involvement:

```bash
PLAN=$(git diff --name-only "origin/${BASE}...HEAD" -- ':(glob)**/context/changes/**/plan.md' \
  | sort -r | head -1)
```

with two refinements worth carrying over verbatim:

- **An explicit PR-body override** — a `Plan: context/changes/<change-id>/plan.md` line wins over the
  convention, handling bundled PRs and revived plans (`SKILL.md:64`). Note the extraction regex is
  anchored to `context/changes/…/plan.md`, which is what stops it becoming a path-traversal primitive
  — any reimplementation must keep that anchoring, because the PR body is attacker-controlled.
- **A graceful "no plan detected" comment** rather than a failure (`SKILL.md:75`), since most PRs in a
  mature repo aren't plan-driven.

This directly resolves the concern in `change.md` §5 that a declined `readPlan` call is
indistinguishable from "no plan found": if resolution is deterministic, "no plan" is a _known state_
with its own explicit output. The mechanic is not reusable as an _agent_ mechanic, but it is
reusable as a _workflow_ mechanic — a distinction `change.md` does not currently draw.

### 3. Where things plug in: the CLI seam

`cli.ts:127` (`runReviewCli`) is fully injectable over `CliIo` and hermetically tested. Its flags are
`--diff-file`, `--out-dir`, `--project-context-file`, `--source-root` (`cli.ts:39`). A `--plan-file`
flag mirrors `--project-context-file` exactly and keeps plan resolution in the workflow.

Critically, **the package does not publish**. It writes `review.json` and `comment.md` to `outDir`
(`cli.ts:196-198`); the composite action then upserts the sticky comment and flips labels
(`.github/actions/ai-review/action.yml`, "Upsert sticky comment" / "Flip verdict label"). Two
safeguards live in that shell and are commented as hard-won:

- the upsert matches only our bot's own comment via `STICKY_MARKER` (`render.ts:8`), so a pasted
  marker cannot hijack the target;
- the verdict label is **added before** the opposite is removed, so a transient API failure never
  leaves the PR unlabelled.

Both are deterministic invariants today. Handing publishing to a model-invoked `postPrComment` would
put them behind a probabilistic call.

### 4. The agent's actual shape constrains the tool design

`createReviewer` (`reviewer.ts:115`) builds a `ToolLoopAgent` with:

- `output: tolerantReviewOutput(...)` (`reviewer.ts:146`) — a **structured-output** agent; `review()`
  returns `result.output` conforming to `reviewResultSchema`;
- `stopWhen: isStepCount(maxSteps)` with the CI default of 5 (`cli.ts:66`);
- `prepareStep: prepareFinalStep(hasSource, maxSteps)` (`reviewer.ts:151`), which strips `activeTools`
  on the final allowed step so a fetch-happy model cannot burn the budget and die with "No output
  generated";
- tools attached **only** when a `source` is provided (`reviewer.ts:152`), because a tool's mere
  presence lets the model loop up to `maxSteps` generations per call.

Consequence: a side-effecting tool can only fire _mid-loop_, before the structured output exists. A
model-invoked `postPrComment` would therefore publish a comment **before** the review object is
finalized — architecturally backwards for a "post the result" step.

### 5. External — prompt injection in CI agents (the strongest evidence)

The last four months produced directly applicable work.

**"Real-World Prompt Injection Attacks in AI-Powered CI/CD Pipelines" (GitInject), arXiv
2606.09935, 2026-06-07.** Provisions ephemeral repos and triggers real workflow runs across four AI
providers. Two findings matter here:

- The precondition is the **"lethal trifecta"**: access to private data, ability to communicate
  externally, and exposure to untrusted content.
- The most critical class is **config-file injection**: an attacker adds `CLAUDE.md` / `AGENTS.md` /
  `GEMINI.md` to the PR branch; because `actions/checkout` checks out the merge commit, the CLI loads
  it as _operator-level_ instruction before any PR content is processed. All tested providers were
  susceptible in default configuration, and the paper concludes the critical vulnerabilities "are
  structural: they arise from how CI/CD infrastructure handles credentials and configuration files,
  not from any specific model's behavior."

This repo has a **structural advantage worth protecting**: `packages/code-reviewer` builds its own
prompt (`prompts.ts` → `buildInstructions`) and does not auto-load `AGENTS.md` / `CLAUDE.md`. It is
not a CLI walking the tree. A plan file read from the PR head is the closest this pipeline has ever
come to a config-file-injection surface, which is why its framing as _data_ is load-bearing rather
than pedantic.

**Microsoft Defender, "Securing CI/CD in an agentic world: Claude Code GitHub action case",
2026-06-05.** Claude Code Action's `Read` tool bypassed the Bash sandbox and reached
`/proc/self/environ`, exposing `ANTHROPIC_API_KEY`; fixed in 2.1.128. Its first recommendation is the
**Agents Rule of Two** — an AI workflow should never hold all three of:

1. exposure to untrusted content,
2. access to sensitive systems or secrets via tools,
3. ability to change state or communicate externally via tools.

Mapped onto this change: the reviewer already has (1) — the diff, PR title and body — and (2) — the
OpenRouter key in the job env. It does **not** have (3), because publishing is deterministic shell.
**Adding `postPrComment` as a model tool adds capability (3) and completes the trifecta.** That is
the decisive argument for `change.md` decision #2, and it comes from outside this repo.

Its sixth recommendation — "Declare the trust model explicitly… state plainly that every one of
them is untrusted user input, not instructions" — is already partly implemented in
`buildInstructions` (the untrusted-data sentence, extended in `finder-file-context` to name tool
results as the same channel). A plan would need the same treatment.

**CSA, "Comment and Control", 2026-04-17.** Three major agents (Claude Code Security Review, Gemini
CLI Action, Copilot Agent) hijacked via PR titles and issue bodies to exfiltrate secrets _through
GitHub itself_ — no external listener needed, so egress controls don't help. Relevant because this
pipeline already passes `PR_TITLE` / `PR_BODY` into the prompt (`cli.ts:177-178`).

**"Poisoning the Safety Net", 2026-05-19.** Attacks specifically on AI code-review pipelines. Two of
its recommendations are already satisfied here and should be treated as invariants rather than
rediscovered: _"Immutable rules source — security policy from somewhere the PR can't reach, not
repo-local AGENTS.md"_ is exactly what `review.yml:69` does by sourcing `.github/ai-review-rules.md`
from the **base** branch; _"Move policy into deterministic gates"_ is the argument this whole
document keeps arriving at. It also observes that reviewers dilute attention across large diffs —
directly relevant to decision #3's "what is stripped from the diff".

**trailofbits/coop PR #415** is a concrete worked example of hardening a review workflow: a
`SECURITY — UNTRUSTED INPUT` preamble, fork-authorship classification, and a caution comment. Its
most transferable observation: the author-association gate "does not cover this, because the
untrusted content is the PR author's diff, not the comment."

### 6. External — prior art converges on a deterministic harness

Three independent projects do plan/spec-vs-code conformance on PRs:

- **Spec Kit CI Guard** (extension to GitHub's Spec Kit, which uses the same `spec.md` / `plan.md` /
  `tasks.md` vocabulary): artifact existence, task-completion percentage, requirement traceability
  matrix, and **bidirectional drift** — forward (spec says it, code lacks it), reverse (code does it,
  spec doesn't mention it), and _decision_ drift (plan says use X, code uses Y). Its stated design
  principles are "**read-only by default** — 4 of 5 commands never modify files" and
  "**deterministic** — same inputs always produce same outputs".
- **Canon** — spec-aware PR reviews that analyze the diff against relevant specs and flag gaps.
- **Sigil** — "review intent, not just diffs"; gates run in CI and `sigil pr` posts the intent-diff
  comment. The **CLI** posts, not a model.

The convergence is the signal: everyone who has built this keeps the analysis read-only and the
publishing deterministic. Spec Kit's _reverse_ and _decision_ drift are also a free idea — this
repo's criteria layer only models forward drift plus EXTRA.

### 7. External — what the AI SDK actually supports

From the AI SDK docs (`/websites/ai-sdk_dev`, agents/loop-control and generating-structured-data):

- **Tools and structured output coexist**, but _"generating the final structured output counts as a
  step"_ — so the step budget must accommodate tool calls _plus_ the output step. This validates
  `prepareFinalStep` and means adding a second pass needs its budget re-derived, not inherited.
- **`toolChoice: 'required'` forces a tool call at every step**, and `prepareStep` can return
  `activeTools` + `toolChoice` per phase. So "the model may simply not call `readPlan`" _is_
  addressable in-SDK — a materially different answer from the one `change.md` §5 assumes.
- The **"done tool"** pattern (a tool with no `execute`) is the SDK's idiom for explicit completion.
- Notably, `ToolLoopAgent`'s `allowSystemInMessages` defaults to rejecting `role: "system"` messages
  in the prompt "because they can create a prompt injection attack risk" — the SDK itself treats
  prompt provenance as a security boundary.

The refined conclusion: forcing `readPlan` is _possible_, but it buys a call, not comprehension —
and this repo has direct evidence that the two differ (haiku-4.5 fetched the right file live and
still failed to connect what it read). Deterministic resolution remains simpler, cheaper, already
written, and failure-visible.

## Code References

- `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md:5` — the criteria layer's own boundary statement ("assumes you already have both inputs in hand")
- `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md:87` — "Run the plan's automated test commands" (the RCE-in-CI section)
- `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md:95` — the same for lint/build/typecheck
- `.claude/skills/10x-impl-review-ci/SKILL.md:44-81` — deterministic plan discovery, PR-body override, graceful no-plan exit
- `packages/code-reviewer/src/cli.ts:39-63` — `parseArgs`; where `--plan-file` would slot in
- `packages/code-reviewer/src/cli.ts:127` — `runReviewCli`, the injectable contract boundary
- `packages/code-reviewer/src/cli.ts:196-198` — writes `review.json` + `comment.md`; the package does not publish
- `packages/code-reviewer/src/reviewer.ts:115-169` — `createReviewer`: structured output, step cap, tools only with a source
- `packages/code-reviewer/src/reviewer.ts:105` — `prepareFinalStep`, the tool-less final step
- `packages/code-reviewer/src/render.ts:8` — `STICKY_MARKER`, the upsert's identity anchor
- `.github/workflows/review.yml:24-27` — same-repo / non-draft / non-bot guards
- `.github/workflows/review.yml:69` — trusted rules sourced from the **base** branch
- `.github/actions/ai-review/action.yml` — "Upsert sticky comment" and "Flip verdict label" (the add-before-remove invariant)

## Architecture Insights

- **The trust gradient is already explicit in this codebase and should be extended, not invented.**
  `projectContext` is documented as trusted and sourced from base (`reviewer.ts:61-66`); the diff and
  tool results are documented as untrusted. A plan is a _third_ category: structurally trusted-looking
  (it's a repo file, in a conventional location, written by the team) but delivered on an untrusted
  branch. That mismatch between appearance and provenance is what makes it dangerous.
- **"Mechanics are not reusable" needs splitting into two claims.** Agent mechanics (subagent
  dispatch, report-file commits) genuinely don't port. Workflow mechanics (plan discovery, running
  checks) port _as workflow steps_ — and are safer there than in the agent.
- **Determinism is a security control here, not just a reliability one.** Every capability kept out of
  the model's hands is a capability an injected instruction cannot reach.
- **The step budget is a shared resource.** With structured output counting as a step and the final
  step tool-less, a second pass cannot simply inherit the finder's budget of 5.

## Historical Context (from prior changes)

- `context/archive/2026-08-10-finder-tool-loop-evals/decision.md` — the finder-model decision this
  change waited on: keep `z-ai/glm-4.6`; sonnet-5 was the only live-probed model that used
  out-of-hunk context correctly, at 57.6× cost, and was declined. Also the source of the tool-adoption
  evidence quoted in `change.md` §5.
- `context/archive/2026-08-10-finder-file-context/` — shipped the `getFileContext` tool and its
  diff-scoped allowlist; its plan listed "no readPlan / write-tools / git-show provider" under _What
  We're NOT Doing_, the guardrail this change deliberately reverses (`change.md` decision #4).
- `context/foundation/lessons.md` — "An offline eval proves capability exists, not that it will be
  used"; and the hosted-Supabase lesson about silent fallbacks, which is the same shape as a declined
  tool call reading as "no plan found".

## Related Research

- `context/archive/2026-08-09-code-review-evals/` — the first finder-model matrix and its harness.
- `context/archive/2026-08-10-finder-tool-loop-evals/verification.md` — instrument gaps that apply to
  any future capability claim here (CI logs requests, never delivery).

## Open Questions

1. **Does the plan pass run as a second agent, or a second `generate()` on the same agent?** A second
   agent means a second structured-output schema and its own budget; reusing the finder means the
   plan text competes with the diff for context.
2. **What replaces the criteria layer's command-execution steps?** Options: drop test-command
   verification entirely; re-map it onto commands the _base_ branch declares (e.g. a fixed allowlist
   of `npm test` / `npm run lint`); or have CI run its own known checks and feed the results in as
   trusted data. The third preserves the criterion's intent without executing plan-derived strings.
3. **Should the plan text be capped and stripped like the diff?** `capDiff` exists for the diff; a
   20k-line plan would blow the context and dilute attention (the "Poisoning the Safety Net" dilution
   effect).
4. **Does the review comment need to distinguish "no plan" from "plan review skipped"?** The skill's
   graceful-exit comment conflates them, and with a deterministic resolver they are different states.
5. **Reverse and decision drift** (from Spec Kit CI Guard) aren't in the current criteria layer. Worth
   adding, or scope creep?
6. **Is `context/changes/**/reviews/**` excluded from the reviewed diff?** `change.md`'s closing note
   flags that committed review documents get echoed back as current findings — unresolved, and it gets
   worse when the agent is explicitly plan-aware.
