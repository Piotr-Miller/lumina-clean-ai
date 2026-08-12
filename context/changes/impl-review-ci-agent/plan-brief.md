# Plan-Aware Implementation Review in the CI Review Agent — Plan Brief

> Full plan: `context/changes/impl-review-ci-agent/plan.md`
> Research: `context/changes/impl-review-ci-agent/research.md`
> Plan review: `context/changes/impl-review-ci-agent/reviews/plan-review.md` (all five findings applied)

## What & Why

Today's AI PR review reads a diff and nothing else — it has no idea what the PR was _supposed_ to do. A PR can drop a planned phase, contradict its own "What We're NOT Doing" list, or ship a declared test file as an empty stub, and the review passes it. This change adds a third pass that judges the PR against the plan it claims to implement, porting the judgment criteria from the `10x-impl-review-ci` skill while writing every mechanic fresh — and deliberately keeping the plan, and the publishing, out of the model's hands.

## Starting Point

`.github/workflows/review.yml` runs an advisory two-pass review: workflow computes the diff and stages base-branch rules → composite action runs the CLI and publishes → package runs finder (`glm-4.6`, diff + a diff-scoped file tool) then judge (`sonnet-5`, findings only, owns the verdict). The package writes `review.json` + `comment.md` and **never publishes**; the action's marker-scoped upsert and add-before-remove label flip are hard-won invariants from earlier reviews.

## Desired End State

A PR that carries a plan **and changes code** gains an **Implementation Review** section in its sticky comment: an overall verdict, the findings behind it, and a collapsed seven-dimension grade table. A PR with no plan gets one neutral line. A pass that fails says so. `ai-cr:passed`/`ai-cr:failed` keep meaning exactly what they mean today — nothing about the new pass can flip a label, block a check, or turn exit 0 into exit 1.

One class is deliberately excluded: a PR whose only content is a plan and/or review documents. The Phase 1 exclusions leave it with an empty diff, and an implementation review with no implementation could only report everything as `MISSING`. Those PRs are skipped visibly.

## Key Decisions Made

| Decision                                  | Choice                                                             | Why (1 sentence)                                                                                                                                          | Source         |
| ----------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Trust boundary                            | Plan is untrusted data, fenced; never instructions                 | It looks like a repo file but arrives on the attacker-controlled head — that appearance/provenance mismatch is the danger                                 | Research       |
| Plan tooling                              | No `readPlan` / `postPrComment` model tools                        | `glm-4.6` made 0 tool calls in 0/6 fixtures and 0/4 live, and a model-invoked publish completes the Agents Rule of Two trifecta                           | Research       |
| Pass architecture                         | Third pass, own agent mirroring `createJudge`                      | Keeps the finder's diff-only contract and 5-step budget untouched; own schema, own budget, independently swappable and failure-isolatable                 | Plan           |
| Command execution                         | Dropped; grade declared-vs-observable                              | The criteria layer mandates running plan-derived strings in a job holding the API key and write token — that is RCE, not review                           | Plan           |
| Plan resolution                           | Both trees, active-first, anchored body override                   | This repo archives _before_ merge, so 6 of the last 7 plan-bearing PRs carry the plan under `context/archive/`, where the skill's glob never looks        | Plan           |
| Model                                     | `sonnet-5` default, own `OPENROUTER_IMPL_REVIEW_MODEL`             | Plan-vs-diff conformance is the exact cross-context reasoning the evals measured `glm-4.6` failing and `sonnet-5` passing                                 | Plan           |
| Tools on the new pass                     | Tool-less; `SourceProvider` seam left unwired                      | Hard one-call cost ceiling and no way for a fetch-happy model to starve the structured output — enabling it later is a wiring change                      | Plan           |
| Diff inputs                               | Strip `reviews/**` + the plan; cap the plan at 40 KB               | Closes the live echo bug where past findings return as current ones; 40 KB is measured against real plans (largest 30,874 chars)                          | Plan           |
| Output surface                            | Same sticky comment, new section, labels unchanged                 | The upsert and label-flip invariants are not touched at all, and a plan pass can fail without disturbing any of them                                      | Plan           |
| Criteria source                           | Vendored, adapted, into `prompts.ts`                               | Two sections cannot port verbatim, and the package's own rule is that all model-facing text lives there; keeps the standalone CI job hermetic             | Plan           |
| Plan is read from Git, not the filesystem | `git ls-tree` mode check, then `git show`                          | A regular-file check follows symlinks, and the reader holds `OPENROUTER_API_KEY` — `plan.md -> /proc/self/environ` would put that key in a public comment | Plan review F1 |
| Exclusion semantics                       | Implementing an excluded item is a violation; its absence never is | The reference contradicts itself (`:40` vs `:104`) and this change's whole value depends on the second reading                                            | Plan review F2 |
| Cost telemetry                            | `implReviewTelemetry` in `review.json`, built in Phases 2–3        | Phase 4's cost criterion was otherwise unverifiable; a dashboard lookup can't be correlated across retries or concurrent runs                             | Plan review F3 |
| Plan-only PRs                             | Skipped visibly, before the review step                            | An empty filtered diff dies at `cli.ts:136`, and with no implementation the pass could only report everything `MISSING`                                   | Plan review F4 |
| "No plan" representation                  | Key absent; no `skipped` variant                                   | Two canonical representations of one state is a contract nobody can rely on                                                                               | Plan review F5 |

## Scope

**In scope:**

- Deterministic plan resolution in the workflow (both trees, active-first, PR-body override), symlink-safe staging from the Git object, and diff exclusions
- An empty-diff skip guard so the exclusions can't turn a plan-only PR red
- `--plan-file` CLI flag with a measured cap, plumbed through the composite action
- A tool-less implementation-review agent with its own model, schema, vendored criteria, and usage telemetry
- Pipeline wiring with failure isolation, and a three-state comment section
- A live probe on a real PR with pre-registered falsification criteria

**Out of scope:**

- Any model-invoked tool on the new pass (`readPlan`, `postPrComment`, file reads)
- Executing anything the plan declares
- Reverse drift and decision drift (Spec Kit CI Guard)
- Committing a report file to the PR branch, or `contents: write`
- Changes to `ai-cr:*` labels, the upsert, the exit-code contract, or the finder's budget
- Cross-workflow check-status reads (`review.yml` runs concurrently with `ci.yml`)
- Any review at all on plan-only PRs — skipped visibly, a deliberate narrowing

## Architecture / Approach

The work splits along the trust boundary. **The workflow owns everything deterministic** — which plan this PR implements, staging it, filtering the diff. **The package owns judgment only** — one more tool-less structured call whose input arrives pre-resolved and fenced. **The action's publishing is untouched.**

```
review.yml:  resolve plan ──► diff (minus reviews/** and the plan) ──► stage base rules
                  │                        │
                  └──────────┬─────────────┘
                             ▼
action.yml:            npm run review  ──►  upsert sticky comment  ──►  flip labels
                             │                    (unchanged)            (unchanged)
                             ▼
package:      finder ──► judge ──► impl-review (tool-less, sonnet, plan+diff)
                                        └── isolated: failure renders, never throws
```

That split is why "no plan found" is a _known state_ with its own rendered output rather than an ambiguous silence — the failure mode a model-invoked `readPlan` could not avoid.

## Phases at a Glance

| Phase                         | What it delivers                                                                                                             | Key risk                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plan resolution + CLI seam | Workflow resolves the plan, stages it from the Git object, filters the diff, guards the empty-diff case; `--plan-file` + cap | Resolution shell is the one part not unit-testable in TS — verified against real merge commits and a symlink scratch branch instead |
| 2. Impl-review agent          | Factory, schema, vendored criteria, own model resolution, usage telemetry                                                    | The vendored criteria now diverge from the skill's reference in one named place and will drift further unaided                      |
| 3. Wiring, render, isolation  | Third pass runs, three-state comment section, `implReview` + `implReviewTelemetry` in `review.json`                          | Touching `render.ts` puts the `STICKY_MARKER` anchor and comment ceiling in play                                                    |
| 4. Live probe + rollout       | Probe PR with four injected deviations, pre-registered bar, cost ratio                                                       | The probe may fail its own bar — a legitimate outcome that must be recorded, not reinterpreted                                      |

**Prerequisites:** none — the feature is inert until `plan-file` is passed, so Phases 1–2 land without changing behavior. Phase 4 needs a scratch PR and roughly one review's worth of OpenRouter spend.
**Estimated effort:** ~4 sessions, one per phase.

## Open Risks & Assumptions

- **Vendored-criteria drift.** The package's copy and the skill's reference will diverge silently — and now provably do, in the exclusion semantics (F2). A parity check was considered and rejected as unwritable (the texts are deliberately different); the mitigation is that each divergence is documented where it is made.
- **Archive-move PRs resolve a stale plan.** A PR that only moves a change folder into `context/archive/` will resolve that plan and review already-merged work. Low harm, visible in the comment, and the body override is the escape hatch.
- **Plan-only PRs lose their code review entirely**, not just the plan section — the skip guard covers the whole review step. A regression on paper; in substance the only thing those PRs were getting was a prose review of the plan itself, which is precisely the low-value noise the exclusions exist to remove.
- **Cost is the highest single call in the pipeline** (`sonnet-5` over up to 140 KB). Bounded by construction, but Phase 4 must measure it rather than assume it.
- **The pass may simply be wrong.** Grading a diff against a plan is harder than finding a bug in a hunk, and `sonnet-5` passing the finder probe is evidence, not proof, that it will do this well. Phase 4 exists for exactly this.

## Success Criteria (Summary)

- A PR that quietly drops a planned change gets told so, in the comment reviewers already read.
- A PR with no plan, or a pass that failed, is visibly distinguishable from a clean review — never silence that reads like approval.
- The existing code review keeps working identically: same labels, same exit codes, same publishing, whatever the new pass does.
