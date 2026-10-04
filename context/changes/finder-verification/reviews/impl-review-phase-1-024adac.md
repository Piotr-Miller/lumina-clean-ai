<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder verification — verify-before-publish pass, pre-registered gate and measurement

- **Plan**: context/changes/finder-verification/plan.md
- **Scope**: Phase 1 of 9 (Phases 0–8)
- **Base**: 52a95ac (Progress — the Phase 0 commit before Phase 1)
- **Head**: 024adac5677075dae692aa8ba02301a1f19b07ef (Phase 1 = `2c4ae34` + the owner-decision fix `024adac`)
- **Worktree**: excluded (`.claude/settings.local.json`, `temp_steps.md`, `context/changes/cloud-exif-orientation/` — outside the reviewed scope)
- **Checks ran at**: 024adac (= HEAD)
- **Manual acceptance**: 1 of 1 confirmed (1.6)
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — A wrong or unreadable source root under `--require-verification` publishes nothing and passes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pipeline.ts:781 (`runVerificationPass`); src/source-provider.ts:237–256; src/cli.ts:337–358
- **Detail**: R8's CI abort fires only when `reader === undefined`, which means `--source-root` is absent or the diff has no post-change path. If the root exists as an argument but is missing, is the wrong checkout, or `realpath(root)` throws, the reader is still built. Every finding then becomes `unverifiable: source-refused`, `verification.status` is `"verified"`, `findings: []`, and the judge grades an empty list: exit 0 and most likely `ai-cr:passed`. The only trace is the footnote "N of N findings withheld". This was reproduced by a sub-agent probe (nonexistent root with a throwing `realpath` → F1 `source-refused`, 0 published, status `verified`). It is the degenerate case of the Definitions row "No source root". That row covers only absence, so the plan has the same gap. It is also the pattern of the lesson "A best-effort integration that degrades silently is indistinguishable from a working one". In the gate runner, a mis-rooted series would count as `verified`, never as a measurement error.
- **Fix A ⭐ Recommended**: In `runVerificationPass`, when findings exist and **every** finding comes out `source-refused`, treat it as no source: throw under `requireVerification`, otherwise `skipped-no-source` with the warning. Add the matching row to Definitions as a plan addendum before the Phase 3 seal.
  - Strength: Catches every way a root can be wrong (missing, wrong commit, unreadable) in one place that the pipeline, the gate runner and the provider all share (`runVerificationPass`), and it sends a mis-rooted gate attempt to the existing measurement-error path.
  - Tradeoff: A PR whose findings are all legitimately off-diff (all refused by the allowlist) would also abort in CI. That is rare and loud, and arguably correct, because nothing could be verified.
  - Confidence: HIGH — the reproduction and the code path are unambiguous.
  - Blind spot: Whether the owner wants "all refused" and "some refused" handled differently. A partial refusal stays per-finding `unverifiable`, as planned.
- **Fix B**: A CLI pre-flight `stat`/`realpath` of `--source-root` before any model call, failing when it is not a readable directory.
  - Strength: Cheap, and fails before money is spent.
  - Tradeoff: Does not catch a readable root at the wrong commit, and does not protect the gate runner or the provider, which do not go through `cli.ts`.
  - Confidence: MED — covers the most likely case only.
  - Blind spot: CI's `$GITHUB_WORKSPACE` checkout ref was not re-checked in this review.
- **Decision**: FIXED via Fix A (owner, 2026-10-04). `runVerificationPass` treats an unusable root as no source: under `requireVerification` it throws before any verifier call; otherwise `skipped-no-source` with `verification.detail`, and the CLI warning names the root as unusable. **Deviation from the literal decision, flagged for the owner:** "every finding source-refused" is evaluated over the findings that cite a file of the diff (≥ 1 required). An off-diff finding is refused by the allowlist by design; counting it would abort a CI review whose only finding is off-diff, which `offDiffFindingPaths` already reports. Tests: CI abort, local pass-through, and the off-diff guard (`pipeline.test.ts`), plus the CLI warning (`cli.test.ts`). The Definitions row in `plan.md` and `gate.md` §3 (with the wrong-commit note) and gate.md §5's measurement-error list are updated.

### F2 — The `>|` cited-line marker leaks across findings that share a merged block

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/excerpts.ts:415–433 (`buildBlocks`); src/prompts.ts:542
- **Detail**: `buildBlocks` pools `cited` ranges from every admitted finding per path and renders them all with `NNNN>|`. The verifier instructions say "a line inside **the finding's** cited range reads `NNNN>| code`". Probe: F1 cites line 5 and F2 cites line 20 of one 30-line file → a single block B1 with both `5>|` and `20>|`, assigned to both findings. The verifier is told that F2's line is part of F1's cited range, which can anchor a verdict on the wrong code. The quote check still holds, so there is no publication bypass. It matters now because the prompt text and `excerpts.ts` are hashed into the Phase 3 seal: fixing it after the seal needs an amendment and a new unseen case.
- **Fix A ⭐ Recommended**: Give each finding in the `<findings>` JSON its cited lines (e.g. `"cited": "5-5"`), and reword the instruction to "`NNNN>|` marks a line some finding cites; each finding's own lines are listed in its entry".
  - Strength: Keeps the merged blocks (D2 shape, budget figures) unchanged, and gives the verifier an exact per-finding anchor.
  - Tradeoff: Changes the prompt and its test, before the seal, which is allowed.
  - Confidence: HIGH — the rendering already knows each candidate's `cited` map.
  - Blind spot: The finding's `startLine`/`endLine` may already be in the findings JSON; if so, only the sentence needs rewording. Not checked.
- **Fix B**: Drop the `>` marker entirely and rely on the line numbers in the findings entries.
  - Strength: Simplest, and nothing can mislead.
  - Tradeoff: Loses the visual anchor, and changes the Definitions/Quote-check text that mentions the marker.
  - Confidence: MED.
  - Blind spot: Effect on luna's quoting accuracy is unmeasured either way.
- **Decision**: FIXED via Fix A (owner, 2026-10-04). The findings entries already carry `startLine`/`endLine`, so only the instruction was reworded: "`NNNN>|` marks a line that some finding cites; each finding's own lines are given in its entry." A test in `prompts.test.ts` pins the sentence, the absence of the old wording, and `startLine` in the entry.

### F3 — Three tests the plan names are missing for the excerpt limits

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/excerpts.test.ts
- **Detail**: The plan asks for "one per row of the table". Missing: (a) the 16,000-character per-finding limit; only the 220-line side is tested (`:282`). (b) E4's "first 2" cap; only one cross-file unit is tested (`:271`). (c) owner interpretation 2: a unit snapped by name included whole and bringing in its E3 callers. The code paths exist (`excerpts.ts:373–387`). These are sealed limits, so an untested limit can drift unnoticed before the seal.
- **Fix**: Add the three tests to `excerpts.test.ts`.
- **Decision**: FIXED (owner accepted, 2026-10-04). Added three tests to `excerpts.test.ts`: the sealed 16,000-character limit (53 lines, under the line limit), E4's first-2 cap, and a unit snapped by name included whole (over 80 lines) with its E3 caller.

### F4 — Over the 25-finding cap, a finding can be labelled `excerpt-over-limit` instead of `review-budget`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/excerpts.ts:512–527
- **Detail**: The per-finding limit is checked before the 25-finding cap. Once 25 findings are admitted, a later finding that is also over its own limit is recorded as `excerpt-over-limit`, while the plan says "the rest `review-budget`". Both are `unverifiable`, so nothing changes in publication, only the reason code in review.json.
- **Fix**: Check the 25-finding cap first.
- **Decision**: FIXED (owner accepted, 2026-10-04). The 25-finding cap is now checked before the per-finding limit. A test in `excerpts.test.ts` fails on the old order.

### F5 — `verification.model` set and status `verified` when no verifier request was sent

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pipeline.ts:851–861; src/schemas.ts (`VerificationBlock`)
- **Detail**: When the planner marks every finding `unverifiable`, nothing is sent and no call is made. The record still carries `model` and `status: "verified"`, while the schema comment says the model is "present only when it ran". `verifierTelemetry` is correctly absent. Also, `excerpts` is optional in the type, though the plan lists it as always present. A record should say what happened; this overlaps F1's degenerate case.
- **Fix**: Omit `model` when nothing was sent (or fix the comment), and make `excerpts` required when `status` is `verified`. Resolve together with F1.
- **Decision**: FIXED (owner accepted, 2026-10-04). `model` is omitted when nothing was sent, and the CLI line reads `model=(not called)`. `VerificationBlock` is now a union: `excerpts` is required for `verified`, and `detail` exists only on `skipped-no-source`. Tests are in `pipeline.test.ts`.

### F6 — The implemented unit grammar differs from E2's text in both directions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/excerpts.ts:112–195
- **Detail**: Wider than E2: `function*`, paren-less arrows `x => …`, one-line units, a JS unit with no closing line ending at the next unit. Gaps:
  - **Python** — a column-0 continuation line of a triple-quoted string ends a `def` early (probe: lines 1–6 detected as 1–2).
  - **JS** — `const f = (a) => a + 1` without `;` absorbs the following `export const CONFIG = {…};`.

  None of this bypasses the gate; it widens, narrows or misplaces excerpts. Phase 3's two-way unit-span check is designed to catch such gaps, but only on the frozen inputs. The E2 row is a sealed term (5).

- **Fix**: Before the seal, align E2's text in the Pre-registration with the implemented grammar, and let the Phase 3 unit-span check decide the gaps (fix any it reports, with a test).
- **Decision**: FIXED (owner, 2026-10-04). Python: a column-0 line inside a triple-quoted string neither ends nor starts a unit. JS: an arrow const whose first line opens no block ends before the next column-0 statement. Both have tests that fail on the old grammar. E2's text in `plan.md` and in `gate.md` §3 is aligned with the implemented grammar. The Phase 3 unit-span check still runs.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-verification/plan.md, context/changes/finder-verification/change.md
- Automated checks at 024adac:
  - `npm test`: 27 files, 927 tests passed.
  - `npm run typecheck`: exit 0.
  - `npm run lint`: exit 0.
  - Root `npm run format:check`: exit 0.
  - `git diff --exit-code 573ee33 -- judge.ts judge.test.ts`: exit 0.
  - `schema-dump.mjs`: the VERIFIER schema reports "forbidden constructs: none"; `oneOf`/`anyOf`/`minimum`/`maximum` appear 0 times.
- The judge-builder hash pin was checked independently: `buildJudgeInstructions()` and `buildJudgePrompt(fixedInput)`, rendered from `573ee33`'s own `prompts.ts`/`schemas.ts`, give `6da8d296…e5ce` and `54b00f0b…477c`, the values `prompts.test.ts:521–528` pins.
- Manual 1.6 holds. `applyVerdicts` (`verifier.ts:307–390`) publishes only at `:368`, for `confirmed` with a passing quote check. The following were probed and are sound:
  - Duplicate, missing and unknown ids.
  - Prefix stripping before the 10-character floor.
  - A quote is searched only in the blocks assigned to its finding.
  - Fence escaping of `</code-excerpt>` and `</findings>`.
  - Reader containment shared with the finder.
  - The regexes, for ReDoS.
- A quote is not tied to the claim: any 10-character substring of an assigned block, such as an import line, satisfies the check. This is R5's stated "necessary condition, not proof", so it is not a finding. The hand-read is what measures it.
- Progress rows 1.1–1.5 cite `2c4ae34`, but `024adac` changed `prompts.ts` afterwards. Its commit message records a fresh green run (927 tests), which this review reproduced at `024adac`.
- Lessons: 34 of 37 entries apply to impl-review (37 total; none lacks an `Applies to` line). Used as priors: silent degradation (F1), the optional schema field (F5), and the schema subset (checked clean).
- Harmless extras (refinements, not contradictions):
  - `VerificationRecord.modelVerdict`.
  - `finishReason` per verifier request.
  - The format repair is skipped for output with no `{` or output cut off at the length limit.
  - `resolveVerifierProviderRouting` / `parseProviders` generalised from the finder's parser.
  - Wider exports from `index.ts`.
