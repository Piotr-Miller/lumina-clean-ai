<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder File Context (getFileContext in CI)

- **Plan**: `context/changes/finder-file-context/plan.md`
- **Mode**: Deep (focus: Phase 1)
- **Date**: 2026-08-10
- **Verdict**: REVISE → **SOUND** after triage (2026-08-10) — all 5 findings FIXED in plan
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict               |
| --------------------- | --------------------- |
| End-State Alignment   | PASS                  |
| Lean Execution        | PASS                  |
| Architectural Fitness | PASS                  |
| Blind Spots           | WARNING (F1, F2)      |
| Plan Completeness     | PASS (3 observations) |

## Grounding

9/9 paths ✓, 8/8 symbols ✓ (incl. exact line ranges cited in the plan), brief↔plan ✓, Progress format ✓.

## Verified clean (deep-pass evidence, no findings)

- `onStepFinish` exists on `ToolLoopAgent` settings AND per-call `generate` options in installed `ai@7.0.52`; the callback event IS the `StepResult`, exposing `toolCalls` (name + input) and `usage` (input/output/totalTokens) — the plan's "zero agent changes beyond a pass-through" claim holds. The SDK swallows callback throws (`Promise.allSettled`), so telemetry can never fail a paid run.
- `finderTelemetry` → artifact flow needs no extra work: `cli.ts:114` serializes the whole `PipelineResult` into `review.json`; downstream only jq-extracts `.verdict` (`action.yml:105`); precedent `preDedupFindingCount` "rides along" the same way.
- No exhaustive-shape test assertions anywhere; the two `PipelineResult` fixture literals (`cli.test.ts:19-32`, `render.test.ts:29-42`) only break if the field is made required — plan already says optional. Keep it optional.
- `withOneRetry` re-invokes the same finder closure (`retry.ts:96-113`), so a closure-scoped accumulator covers both attempts, as planned.
- Blast radius: no consumers outside the package; `evals/finder-provider.ts` confirmed tool-less (`fileContextTool: false`) exactly as scoped out. Why "`review()` signature unchanged" is load-bearing: the eval's `review-result.schema.json` has `additionalProperties: false` — any field added to `ReviewResult` breaks the eval gate.

## Findings

### F1 — Symlink in the diff serves out-of-tree content through the allowlist

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 provider contract + Critical Implementation Details ("Security property")
- **Detail**: The exact-match allowlist guarantees the requested NAME is in the diff — not that the CONTENT served is that file. A PR that adds a symlink (e.g. `evil.ts -> ../.git/config`) puts its path in the allowlist; `readFileSync` (`review-pr.ts:12`) follows the link on the Linux runner, and `actions/checkout` persists the job token in `.git/config` by default. Model output lands in a public PR comment. Mitigated by the existing trust model (`review.yml`: same-repo, human-authored PRs only — collaborators already have simpler attack paths), so this is defense-in-depth — but the plan presents the allowlist as closing the recorded security future-work, so the contract should own this case.
- **Fix A ⭐ Recommended**: Containment check on the resolved target — after the allowlist hit, require `realpath(join(root, path))` to be a regular file under `realpath(root)`; otherwise return the refusal string.
  - Strength: Closes the whole class (symlink file AND symlink parent dir); ~5 lines; checks the resolved filesystem target, so it does NOT violate the plan's no-request-normalization rule — the allowlist stays literal exact-match.
  - Tradeoff: Provider needs a second injected fs op (realpath/stat) beyond `CliIo.readFile`, slightly widening the hermetic-test seam.
  - Confidence: HIGH — `readFileSync` following symlinks and checkout's persist-credentials default are documented behavior.
  - Blind spot: Windows local runs resolve realpath differently (junctions); CI is Linux, local is tool-less by default, so low exposure.
- **Fix B**: Document residual risk + `persist-credentials: false` — add the symlink caveat to the seam docstring and turn off credential persistence in `review.yml`'s checkout.
  - Strength: One-line workflow change removes the juiciest target; zero provider complexity.
  - Tradeoff: The read-any-runner-file channel itself stays open; relies on nothing else sensitive being on disk.
  - Confidence: MEDIUM — needs a check that no later step does authenticated git against the checkout.
  - Blind spot: Future workflow edits could silently re-add on-disk secrets.
- **Decision**: FIXED — strengthened Fix A + Fix B: provider rejects any symlinked file/path component (realpath equality + regular-file check under realpath(root)), reads the verified resolved path; unit tests added for `src/evil.ts -> ../.git/config` (in-root target) and an out-of-root symlink; `review.yml` checkout gains `persist-credentials: false` (gh steps use GH_TOKEN, nothing needs persisted creds).

### F2 — Path-format mismatch: tool description says "exactly as given in the review unit", which shows b/-prefixed headers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 provider contract (refusal design)
- **Detail**: The diff is produced with default git prefixes (`review.yml:55`), so the model sees `+++ b/src/x.ts` inside the review unit, while the allowlist stores stripped `src/x.ts`. The tool description (`reviewer.ts:122`, untouched by the plan) says "File path exactly as given in the review unit" — a literal-minded model can request `b/src/x.ts`, miss the set, and burn one of only 5 loop steps on a refusal that (per the plan) only names the path as outside the diff — no recovery signal. Mitigating evidence: archived real-run fixtures show the model conventionally emits stripped paths, so probability is low-to-moderate — but each miss is 20% of the step budget, and Phase 3's planted-flaw verification rides on the tool working within it.
- **Fix A ⭐ Recommended**: Refusal string enumerates allowed paths — on any miss, list the allowlisted (stripped) paths so the model self-corrects on the next call.
  - Strength: Also recovers every OTHER miss class (renamed files, git-quoted paths, hallucinated paths); zero change to matching logic.
  - Tradeoff: First miss still costs one step; refusal length grows with diff file count (bounded — cap the listing if paranoid).
  - Confidence: HIGH — standard tool-UX pattern; hermetically testable.
  - Blind spot: None significant.
- **Fix B**: Store both literal forms in the allowlist — add `b/<path>` alongside `<path>` to the set (still literal exact-match, no request transformation).
  - Strength: Zero wasted steps on the prefix case.
  - Tradeoff: Two canonical forms leak into telemetry/stderr lines; doesn't help other miss classes; slightly muddies the "set == diff paths" property.
  - Confidence: HIGH — trivially safe.
  - Blind spot: None significant.
- **Decision**: FIXED — tool-description fix + Fix A: `getFileContext` path description now requires repository-relative paths without `a/`/`b/` prefix (removing the contradictory "exactly as given in the review unit"); refusal repeats the required format and enumerates a deterministic, capped allowed-path list with omitted count. Set stays == stripped diff paths (no duplicate forms).

### F3 — onStepFinish is a deprecated alias in installed ai@7.0.52

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 reviewer contract
- **Detail**: `ToolLoopAgentSettings` has both `onStepEnd` and `onStepFinish`; the latter is marked "@deprecated Use onStepEnd instead" (both functional; identical signature — the event IS the `StepResult`).
- **Fix**: Wire the internal forward to `onStepEnd`; keep whichever surface name you prefer on `ReviewerOptions` (`onStepEnd` for consistency is the cheap choice now).
- **Decision**: FIXED — plan renamed to `onStepEnd` throughout (surface name + internal forward); contract notes `onStepFinish` is the deprecated alias.

### F4 — Provider contract silent on endLine-only requests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 provider contract
- **Detail**: The tool schema allows `startLine` and `endLine` independently optional; the contract covers missing `endLine` (→ EOF) but not missing `startLine`. Note `fetchBoundedContext`'s range clamp also only fires when BOTH are present — single-sided requests reach the provider unclamped (`MAX_CONTEXT_CHARS` still bounds output).
- **Fix**: One line in the contract: missing `startLine` → line 1; add the endLine-only row to the unit-test list.
- **Decision**: FIXED — contract now states missing `startLine` → line 1 (+ the single-sided-unclamped note); test list gains endLine-only/startLine-only cases.

### F5 — Per-attempt step attribution unspecified for retried runs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 telemetry contract (touches Phase 2 stderr lines)
- **Detail**: SDK `stepNumber` resets to 0 on the retry attempt, and telemetry deliberately accumulates both attempts — so telemetry `steps` can exceed `finderMaxSteps` (intended: real spend), and stderr "step index" lines would repeat indices after a retry. `StepResult.callId` uniquely identifies each attempt.
- **Fix**: Note in the contract that `steps` counts generations across attempts (may exceed the cap); have the CLI keep its own monotonic counter for stderr lines (or log `callId`).
- **Decision**: FIXED — telemetry contract documents cross-attempt accumulation (`steps` may exceed `finderMaxSteps`; `callId` disambiguates); CLI stderr lines use a CLI-maintained monotonic index, not SDK `stepNumber`.
