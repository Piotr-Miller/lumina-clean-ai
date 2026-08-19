# Diff Truncation and Fabricated Absence — Implementation Plan

## Overview

A PR carrying a generated snapshot gets an implementation review that declares present files **missing**,
at CRITICAL severity, with a `REJECTED` verdict. This change fixes the two independent causes: the
snapshot spends the diff budget, and the pass that grades completeness is never told its input was cut.

The framing matters because it decides the fix. **The model was not hallucinating.** Given the window it
was shown, `MISSING` was the correct inference and `REJECTED` was the mandated consequence. Both defects
are upstream of the model.

## Current State Analysis

Reconstructed from the squashed commit for PR #143 (`95da1e5`), measured not estimated:

- The reviewed diff is capped at `DIFF_CAP_BYTES = 100_000` (`packages/code-reviewer/src/pipeline.ts:40`).
- PR #143's diff was **841,417 bytes** with both existing exclusions applied — **8.4× the cap**.
- `git diff` emits paths in sort order, so the 100 KB window reached exactly five files, four prose and
  the fifth machine-generated, all under `context/archive/`:

  ```
  change.md   decision.md   plan-brief.md   research.md   results/baseline-n20.json ←cut inside
  ```

- **No line of `packages/code-reviewer/` — the entire implementation — was in the reviewed diff.** The
  pass was asked "was this plan implemented?" while shown only the plan's own prose.

### Key Discoveries

- `results/baseline-n20.json` is **711,641 bytes**: 85% of the post-exclusion diff on its own. All four
  committed eval snapshots run 467 KB–1.02 MB, so this recurs on every eval change —
  `finder-severity-calibration` will produce another as soon as it runs.
- **The prompt mandates the failure.** `IMPL_REVIEW_COMPARISON_RULE` (`prompts.ts:155`) requires every
  planned change absent from the diff to be graded `MISSING`; dimension 1 (`prompts.ts:158`) says "FAIL
  on any planned change missing from the diff"; the verdict rule (`prompts.ts:172`) says "REJECTED on any
  critical FAIL". Each instruction is sound **only under an unstated precondition: the diff is complete.**
- **That precondition is guarded for the plan and unguarded for the diff.** `prompts.ts:221` already
  emits "Do not treat anything you cannot see as missing, unplanned, or out of scope" when
  `planTruncated` is set. `ImplReviewPromptInput` (`prompts.ts:193-201`) has no `diffTruncated` field at
  all, and `pipeline.ts:541` passes only `plan.truncated`.
- `capDiff` sets `diffTruncated` (`pipeline.ts:337`) and it travels to exactly one place:
  `render.ts:228`, a footnote **below the entire comment including the verdict it should qualify**.
- The impl reviewer already receives the _capped_ diff — `pipeline.test.ts:809` pins `input.diff` to the
  post-cap value. Only the flag is missing, so this is a threading change, not a data-flow change.
- `DIFF_TRUNCATION_MARKER` is appended inside the fenced diff, but it is in-band text at the tail of an
  untrusted block with no accompanying directive. It did not prevent this.
- **Binary artifacts are a non-issue.** `.gitattributes` marks `*.png`/`*.jpg` as `binary`, so the 6.4 MB
  and 4.0 MB committed images render as four diff lines regardless of size. Verified directly.

## Desired End State

1. A generated eval snapshot never consumes the reviewed diff's byte budget.
2. When the diff _is_ truncated, the implementation review is told so in the same terms the plan already
   gets, and cannot read its own truncated window as deleted work.
3. A reader who sees `REJECTED` sees the truncation caveat **at the verdict**, not in a footnote below
   everything else.

## What We're NOT Doing

- **Not raising the cap.** It is a cost control, and a 900 KB diff would blow any cap worth having. The
  problem is what fills it and the silence about the cut.
- **Not excluding lockfiles.** Considered and deliberately deferred (decision 2026-08-19). The file sizes
  are large (650 KB, 491 KB) but the _diffs_ are not: across the last 12 lockfile-touching commits they
  ran 370 B–77 KB, with only two outliers over the cap (557 KB, 477 KB). An occasional hazard, not a
  systematic one, and excluding lockfiles hides registry/resolved-URL tampering. Revisit as its own
  change if an outlier actually causes a bad review.
- **Not a size-based exclusion rule.** Too indiscriminate — it would silently drop genuinely large source
  changes, and a path glob in the workflow is auditable where a threshold is not.
- **Not mechanically suppressing MISSING findings when the diff is truncated.** That trades a visible
  false positive for an invisible false negative, on exactly the large PRs that most need review.
- **Not touching the finder.** Same gap, no evidence of misbehaviour — it anchored 7/7 findings correctly
  on #143 and fabricated nothing. Its prompt is pinned by the eval matrix, so a change there needs an
  eval run to prove no regression. Registered as a follow-up (see References).
- **Not fixing path-order bias.** `context/` always sorts before `packages/`, so prose-heavy changes
  systematically starve their own source files. Exclusions mitigate; they do not fix. A real fix
  (source-first ordering, or per-path budgets) is a separate design decision and a separate change.

## Implementation Approach

Two phases, independent and independently shippable. Phase 1 is a one-line workflow change that removes
the observed trigger. Phase 2 removes the silence, which is what makes the class recur with any other
oversized text file. Phase 1 alone is **not** sufficient: without the snapshot, PR #143's diff was still
~130 KB — over the cap, still truncating, still silent.

## Phase 1: Exclude generated result snapshots from the reviewed diff

### Overview

Add a results glob to the existing exclusion array in the review workflow, alongside the reviews glob.

### Changes Required:

#### 1. `.github/workflows/review.yml` — the exclusion array

At line 175 the array is built with a single literal element (the `**/reviews/*.md` exclusion). Add the
results glob as a second literal element. Extend the comment block above it (lines 164-174) with the
third reason, in the same voice as the existing two: generated eval snapshots are machine-written, nobody
reviews them line by line, and one of them consumed 85% of PR #143's diff budget.

Three existing properties carry over and must be preserved:

- The array form is deliberate — an unquoted expansion word-splits a path containing a space. Keep it.
- The `getFileContext` allowlist derives from this diff, so the exclusion correctly narrows the tool's
  reach too. This is already noted in the comment; it stays true.
- The empty-diff guard below (lines 181-192) already handles a PR that filters down to nothing. A
  results-only PR now hits it, which is the correct visible-skip behaviour, not a regression.

### Success Criteria:

#### Automated Verification:

- [x] Re-measuring `95da1e5` with the new exclusion added drops the diff from 841,417 to roughly
      130,000 bytes (same `git show ... | wc -c` recipe used to produce the 841,417 figure). **Measured: 120,914** — and the window now reaches `packages/code-reviewer/evals/`, the files the failing review had called missing.
- [x] The workflow still parses: `gh workflow view "AI Code Review"`
- [x] `npm run lint` passes (the workflow is not linted, but the repo gate must stay green). Package lint
      clean. Root lint reports one **pre-existing, unrelated** error in `supabase/.temp/start-secrets/…`
      — untracked local `supabase start` output, gitignored at `supabase/.gitignore:3`, so CI's clean
      checkout never sees it. The 55 warnings are pre-existing `no-console`.

#### Manual Verification:

- [x] On this change's own PR, confirm the sticky comment does **not** carry the "diff truncated" note. Verified on PR #146.
- [x] Re-read the exclusion comment as a stranger: does it say _why_ each glob is excluded, not just
      that it is?

## Phase 2: Tell the implementation review its diff was cut

### Overview

Thread `diffTruncated` into the impl-review prompt input, emit a directive mirroring the plan's, and
surface the caveat at the verdict rather than only in the footnote.

### Changes Required:

#### 1. `packages/code-reviewer/src/prompts.ts` — the field and the directive

Add `diffTruncated?: boolean` to `ImplReviewPromptInput` (after `planTruncated`, ~line 201), with a
doc comment in the same style: the model must not read absence as deletion.

In `buildImplReviewPrompt`, emit a NOTE when set, parallel to the existing plan note at lines 216-223.
The wording must name the consequence the prompt otherwise mandates, because
`IMPL_REVIEW_COMPARISON_RULE` explicitly instructs a `MISSING` grade for anything absent:

> NOTE: the diff was truncated to fit the context budget. Files and hunks that are part of this change
> are absent from what you can see. Do not grade anything you cannot see as MISSING, and do not conclude
> that planned work is unimplemented — say you could not verify it instead.

Both notes must be able to appear together (a PR can truncate plan _and_ diff); keep them as separate
array entries, not an if/else.

#### 2. `packages/code-reviewer/src/pipeline.ts` — thread the flag

At line 541 the pass is invoked with only `plan.truncated`. `diffTruncated` is already in scope from
line 337. Add it using the same conditional-spread shape as its neighbour, so `false` stays out of the
serialized input rather than being passed unconditionally.

#### 3. `packages/code-reviewer/src/render.ts` — caveat at the verdict

In `renderImplReviewSection` (lines 156-166), the "Reviewed against `<plan>`" line sits directly under
the verdict header. When the diff was truncated, add a sentence there so it is read with the verdict:

> ⚠️ The diff was truncated at 100 KB, so this review saw only part of the change. Findings that claim
> work is missing may reflect the truncation rather than the PR.

`renderImplReviewSection` already takes the whole `result`, and `diffTruncated` is on `PipelineResult` —
no signature change needed. Keep the existing footnote at line 228 as well; they serve different readers.

#### 4. Tests

- `prompts.test.ts` — mirror the existing plan-truncation test (lines 392-397): the directive appears
  when the flag is set, is absent when it is not, and **both notes render together** when both flags are
  set.
- `pipeline.test.ts` — extend "hands the pass the capped diff and the plan-truncation flag" (line 809) to
  assert `diffTruncated` arrives. Add a case where the diff exceeds `DIFF_CAP_BYTES` and the plan does
  not, so the two flags are proven independent.
- `render.test.ts` — mirror the plan note test (line 342): the verdict-level caveat appears on a
  truncated diff and not otherwise.

### Success Criteria:

#### Automated Verification:

- [x] `cd packages/code-reviewer && npm run typecheck`
- [x] `cd packages/code-reviewer && npm test` — all existing tests pass, new ones included
- [x] `npm run lint`
- [x] No existing test asserts prompt equality in a way the new note breaks (grep `planTruncated` across
      the test files before running)

#### Manual Verification:

- [x] Read `buildImplReviewPrompt` output with both flags set — the two NOTEs must not contradict or
      duplicate each other.
- [x] Confirm the new directive does not weaken genuine MISSING detection: with `diffTruncated` unset,
      the prompt is byte-identical to today's.

## References

- `context/changes/review-diff-truncation/change.md` — the registration, with full measurements
- `context/foundation/lessons.md` — "A large committed artifact silently blinds the AI review"
- `context/archive/2026-08-13-finder-security-vocabulary-bias/reviews/impl-review.md` — the original
  diagnosis; run [`31844849055`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31844849055)
- `context/foundation/review-pipeline-verification.md` — impl-review anchoring, still open; this change's
  PR produces another real run for it
- Follow-ups deliberately not in this change: the finder's identical truncation gap; path-order bias;
  lockfile exclusion policy

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Exclude generated result snapshots from the reviewed diff

#### Automated

- [x] 1.1 Add the results glob to the EXCLUDES array and extend the rationale comment — 9703f9e
- [x] 1.2 Verify the measured drop on 95da1e5 (841,417 → ~130,000 bytes) — 9703f9e
- [x] 1.3 Workflow parses; `npm run lint` green — 9703f9e

#### Manual

- [x] 1.4 This change's own PR shows no "diff truncated" note — verified on PR #146, run 32255940666: the
      footnote reads only "PR body truncated at 2,000 chars". Code review PASSED, implementation review
      APPROVED on all seven dimensions.
- [x] 1.5 Exclusion comment states why, not just what — 9703f9e

### Phase 2: Tell the implementation review its diff was cut

#### Automated

- [x] 2.1 Add `diffTruncated` to ImplReviewPromptInput and emit the directive — 9703f9e
- [x] 2.2 Thread the flag through pipeline.ts:541 — 9703f9e
- [x] 2.3 Render the caveat at the impl-review verdict — 9703f9e
- [x] 2.4 Tests: prompts, pipeline (flags independent), render — 9703f9e
- [x] 2.5 typecheck, test, lint all green — 9703f9e

#### Manual

- [x] 2.6 Both NOTEs read coherently when plan and diff are truncated together — 9703f9e
- [x] 2.7 Prompt is unchanged when diffTruncated is unset — 9703f9e
