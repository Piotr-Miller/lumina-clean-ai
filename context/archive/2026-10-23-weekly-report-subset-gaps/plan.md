# Weekly Report Subset Gaps Implementation Plan

## Overview

This change closes two low-risk input gaps in the AI review weekly report (`packages/code-reviewer`). They were found in the phase-3 review and in the AI review of PR #305:

1. **Impl finding text reaches `report.json`.** `reviewJsonSubset` parses `implReview.findings` as `z.array(z.unknown())`, so each finding's `title` / `detail` / `fix` survives parsing. The 90-day `ai-review-weekly-report` artifact then carries it. The predecessor plan promised a narrow subset of `PipelineResult`.
2. **Rows without a usable run ID collapse in the collector.** `collectWeek` deduplicates rows by `run.id` with a `Set`. Its zod `.catch` maps a missing ID to `NaN`, and a `Set` treats every `NaN` as equal. Two rows without an ID therefore become one, and the report's "rows had a run ID that is not a positive integer" warning undercounts. The same happens to two rows carrying the same other invalid value (`0`, `-5`).

Both fixes are local to the parse and collect edges. No rendering, workflow, alarm or documentation behaviour changes.

## Current State Analysis

- `packages/code-reviewer/src/weekly-report.ts:98-113` — `reviewJsonSubset`. Top-level `findings` is already `z.array(z.object({ severity }))`, so zod strips everything except severity. `implReview.findings` (line 108) is `z.array(z.unknown())`, so it keeps every key. The docstring at lines 91-97 says finding text "is stripped at parse time". For impl findings that is false today.
- The parsed `ReviewJson` lives on in `ReportRun.runClass.review` (`weekly-report.ts:216`, `:662`). `weekly-report-cli.ts:147` writes the whole `WeeklyReport` to `report.json`. The only consumer of impl findings is `addFindings` / `findingsOf`, and both read `.length` alone (`weekly-report.ts:533`).
- The compile-time pin `ReviewJsonSubsetPinned` (`weekly-report.ts:119-131`) requires `Pick<PipelineResult, …>` to be assignable to the subset's inferred type. Installed Zod infers `Record<string, never>` for `z.object({})`, so the empty object schema alone breaks the pin. Use `z.object({}).transform((value): object => value)` to strip every key at runtime and widen the output type to `object`; `ImplFinding[]` remains assignable to `object[]`. A transform to a count would not hold, because `number` is not assignable from an array.
- **Premise verified at planning (2026-10-23).** A scratch probe called `parseReviewJson` on a `reviewed` impl block with `{ title: "SECRET-TITLE", detail, fix }`, and the output kept the title word for word. `new Set([NaN]).has(NaN)` returned `true`.
- The tests do not see gap 1. The fake fixture's impl findings are `[]` (`weekly-report-github-fake.ts:318`). The core test fixture's impl findings carry only `{ id }` (`weekly-report.test.ts:62`). The CLI test asserts the absence of hostile text in `report.md` only (`weekly-report-cli.test.ts:80-81`). It never checks `report.json`.
- `packages/code-reviewer/src/weekly-report-github.ts:120` maps an unreadable `id` to `NaN`. Lines 423-426 deduplicate by `run.id` before the window filter. Lines 446-452 already pass an invalid-ID row to the core without any lookups.
- The core already decides gap 2's definition, and it decides it as the user did (origin `code`, now confirmed by the user). `aggregateWeek` counts every row whose ID is not a positive safe integer (`weekly-report.ts:641`, `:791`) and never deduplicates such rows. `weekly-report.test.ts:620-628` pins five invalid rows, two of them `NaN`, as `invalidRunIds === 5`. The collector is the only place where rows collapse.
- **Correction to the `change.md` note.** The note says the collapse undercounts "coverage gaps". It does not. Invalid-ID rows never enter `coverageGapWorkflows` (`weekly-report.ts:764` counts only `runs`, which are drawn from `validIds`). The only figure the collapse lowers is `invalidRunIds`. The user confirmed on 2026-10-23 that this stays so (see Definitions).

### Carried from predecessor

| Item                                                                                      | Source (path + finding)                                                                                                                                   | Disposition (`carried forward` / `resolved` / `superseded`)                                                                                            | Addressed in    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Plan-review findings F1–F6                                                                | `context/changes/ai-review-weekly-report/reviews/plan-review.md` F1–F6                                                                                    | resolved (all `FIXED`)                                                                                                                                 | —               |
| Phase 1 impl-review F1–F8                                                                 | `context/changes/ai-review-weekly-report/reviews/impl-review-phase-1-1baf547.md` F1–F7 (closed by Re-review 2), round 2 F8                                | resolved (all `FIXED`)                                                                                                                                 | —               |
| Phase 2 impl-review F1                                                                    | `context/changes/ai-review-weekly-report/reviews/impl-review-phase-2-94310b5.md` F1                                                                       | resolved (`FIXED`)                                                                                                                                     | —               |
| Phase 3 impl review                                                                       | `context/changes/ai-review-weekly-report/reviews/impl-review-phase-3-1f13e6f.md` (no findings)                                                            | resolved                                                                                                                                               | —               |
| Review fix follow-ups                                                                     | `context/changes/ai-review-weekly-report/follow-ups/review-fixes.md` (phase 2 F1, phase 1 F8: applied fixes)                                              | resolved                                                                                                                                               | —               |
| Narrow-subset promise vs `implReview.findings: z.unknown()`                               | predecessor `plan.md` Critical Implementation Details — "Untrusted data in `review.json`"; phase-3 review / PR #305 AI review (this change's `change.md`) | carried forward                                                                                                                                        | Phase 1         |
| Invalid-ID rows collapse in `collectWeek`                                                 | PR #305 AI review (this change's `change.md`)                                                                                                             | carried forward                                                                                                                                        | Phase 2         |
| Manual 2.5 re-confirmation (surface `packages/code-reviewer/src/weekly-report-github.ts`) | predecessor `plan.md` Progress 2.5, `unverifiable` (revision not in current history)                                                                      | carried forward — this change edits that surface, so re-confirm 2.5 **after** Phase 2 lands, or accept that a confirmation recorded earlier goes stale | Phase 2 note    |
| Manual 1.5, 3.5, 3.6 re-confirmation; 4.3 pin; 4.4 first scheduled run                    | predecessor `plan.md` Progress                                                                                                                            | carried forward — stays with the predecessor; this change does not touch `weekly-report-render.ts` or `AGENTS.md`                                      | — (predecessor) |

## Definitions

| Term                          | Decided meaning                                                                                                                                                                                            | Origin                                                        | On degenerate data (tie, duplicate, empty, boundary, legacy)                                                                                                                                                                                                        | Verified by                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Narrow subset (impl findings) | From `implReview.findings` the report keeps only each element's existence, for the count. Every key of every element is dropped at parse time and never reaches `ReportRun`, `report.json` or `report.md`. | product (predecessor plan, "Untrusted data in `review.json`") | Empty array → count 0, still readable. An element with `title`/`detail`/`fix` → parsed as `{}`. A non-object element (string, null) → the artifact is unreadable, the same as for top-level `findings`. Artifacts already published are unaffected (see NOT doing). | 1.1 core test; 1.1 CLI test on serialized `report.json` |
| Invalid run row               | A runs-list row whose `id` is not a positive safe integer (missing → `NaN`, `0`, negative, fractional).                                                                                                    | code (`weekly-report.ts:641`), confirmed by user 2026-10-23   | Each row counts once **as a row**. Two rows are never merged, even when their invalid values are equal (`NaN`/`NaN`, `0`/`0`). Valid IDs still deduplicate as before.                                                                                               | 2.1 collector test                                      |
| Coverage gap (alarm count)    | Unchanged: distinct valid workflow IDs in {unreported} ∪ {incomplete/unknown attempt coverage}. Invalid-ID rows appear only on their own warning line and never add to the alarm count.                    | user (F4 Fix A, 2026-10-22; reconfirmed 2026-10-23)           | 4 coverage-gap workflows + 1 invalid-ID row → `coverageGapWorkflows = 4`, no alarm at the default of 5, and the warning says 1 row.                                                                                                                                 | 2.1 collector→core test                                 |

## Desired End State

- `report.json` for a week with a `reviewed` impl pass carries `implReview: { status, verdict, findings: [{}, …] }`. The impl finding count is unchanged and no finding text remains. `report.md` is byte-identical to today for the same input.
- `collectWeek` returns one `RawRun` per row whose ID is invalid, and deduplicates only positive safe integer IDs. Two rows without an ID produce "2 rows had a run ID that is not a positive integer". Coverage-gap counts and alarm decisions do not move.
- Verify: the package suite, typecheck, lint and Prettier pass. A local dry run's `report.json` contains no impl finding keys.

### Key Discoveries:

- The top-level findings schema shows the pattern to copy: `z.array(z.object({ severity: severitySchema }))` (`weekly-report.ts:100`). Zod 4 (`package.json` `"zod": "^4.4.3"`) strips unknown keys on `z.object` by default.
- The type pin (`weekly-report.ts:119-131`) is what rules out transforming the findings into a count.
- The collector already lets invalid-ID rows through without lookups (`weekly-report-github.ts:446-452`). Only the `seen` dedup (`:423-426`) needs the guard.
- The existing collector test for "a duplicated run once" (`weekly-report-github.test.ts:64-75`) pins valid-ID dedup and must keep passing.

## What We're NOT Doing

- **Model ids in `report.json`** — still parsed as free strings. They come from workflow config and vars, not from PR diff content, and the comment already renders non-matching ids as `(unrecognised model id)`. Owner decision 2026-10-23: out of scope.
- **Invalid-ID rows in the coverage alarm** — they stay off `coverageGapWorkflows`. The alarm definition, the alarm body and AGENTS.md are untouched. Owner decision 2026-10-23.
- **Deleting already-uploaded artifacts** — the W43 `ai-review-weekly-report` artifacts (runs 40021370975, 40021649177) may contain impl finding text. They are left to expire on their 90-day retention. The same text is already public in the PR's sticky comment and in the run's own `ai-review-output` artifact.
- **Narrowing the rest of the subset or the render path** — severity, counts, costs and enums are already narrow, and `weekly-report-render.ts` does not change.
- **Editing the predecessor's `plan.md`** — its promise was right and its code fell short. This change fixes the code and leaves that record as it is.

## Implementation Approach

The work is two phases, one per gap, so each fix lands and is reviewed in its own commit. Phase 1 tightens a schema at the parse edge. Phase 2 adds a guard at the collect edge. Each phase writes its regression test so that it fails against today's code: the serialized-JSON assertion in Phase 1, the two-NaN row count in Phase 2. Then the phase fixes the code.

## Phase 1: Strip impl finding content at parse time

### Overview

Parse `implReview.findings` as objects with no kept keys, so only the count survives. Then prove it on the serialized `report.json`, not only on `report.md`.

### Changes Required:

#### 1. Subset schema

**File**: `packages/code-reviewer/src/weekly-report.ts`

**Intent**: Replace `z.array(z.unknown())` in the `reviewed` impl variant with an array of empty objects, so zod strips every key and impl finding text never enters the report. Update the docstring above `reviewJsonSubset` only if the code no longer matches its wording. After the fix, "finding text … is stripped at parse time" becomes true, so it may need nothing more than naming impl findings.

**Contract**: `reviewJsonSubset.shape.implReview` `reviewed` variant has `findings: z.array(z.object({}).transform((value): object => value))`. The `reviewed` variant's findings infer as `object[]`, while every parsed element is `{}` at runtime. Keep `ReviewJsonSubsetPinned` unchanged; it still typechecks with this widened output type. `addFindings` keeps reading `.length`. A non-object element now makes `parseReviewJson` return `undefined`, so the run becomes `artifact unreadable`.

#### 2. Tests

**Files**:

- `packages/code-reviewer/src/weekly-report.test.ts`, core: a `reviewed` impl block whose findings carry `title`/`detail`/`fix` strings parses to elements with no keys, keeps the impl finding count, and the serialized `aggregateWeek` output contains none of those strings. A non-object impl finding element makes the run `artifact unreadable`.
- `packages/code-reviewer/src/weekly-report-github-fake.ts`, `packages/code-reviewer/src/weekly-report-cli.test.ts`: give the fake `reviewJson`'s impl block one finding with hostile `title`/`detail`/`fix` text. The CLI test asserts that the raw `report.json` file text contains none of it, alongside the existing `report.md` assertions.

**Intent**: Pin the narrow-subset promise where it was broken, which is the serialized artifact. The rule from lesson "A guard metric that only exists on success…" applies: assert on the whole serialized object, because that is where the leak shows.

**Contract**: The new assertions fail against today's `z.unknown()` and pass after change 1. Existing tests that count impl findings (`implFindings` fixture, `findings.impl` totals) stay unchanged. If adding a finding to the shared fake `reviewJson` changes an existing count assertion, put the hostile finding behind an opt-in parameter or a dedicated fixture rather than editing the expected count.

### Success Criteria:

#### Automated Verification:

- Core and CLI tests pass, including the new serialized-`report.json` assertions: `cd packages/code-reviewer && npx vitest run src/weekly-report.test.ts src/weekly-report-cli.test.ts` — at planning: exit 0 — the new assertions land in Phase 1 and must be seen failing before the schema change
- Package typecheck passes, so the subset pin still holds: `cd packages/code-reviewer && npm run typecheck` — at planning: exit 0
- Package lint passes: `cd packages/code-reviewer && npm run lint` — at planning: exit 0
- Full package suite passes: `cd packages/code-reviewer && npm test` — at planning: exit 0 (26 files, 880 tests)
- Formatting holds for the package sources: `npx prettier --check packages/code-reviewer/src` — at planning: exit 0
- A local dry run's `report.json` has no impl finding keys: `cd packages/code-reviewer && GH_TOKEN=$(gh auth token) npm run weekly-report -- --repo Piotr-Miller/lumina-clean-ai --owner Piotr-Miller --week 2026-W43 --dry-run --out-dir <scratch>/w43`, then check that every `runs[].runClass.review.implReview.findings[]` in `<scratch>/w43/report.json` is `{}` — not run: external

---

## Phase 2: Never merge invalid-ID rows in the collector

### Overview

Deduplicate only rows whose ID is a positive safe integer, so every invalid-ID row reaches the core and is counted once.

### Changes Required:

#### 1. Collector dedup

**File**: `packages/code-reviewer/src/weekly-report-github.ts`

**Intent**: In `collectWeek`'s first filter, apply the `seen` check only to positive safe integer IDs. Let every other row through to the window filter and then to the existing invalid-ID branch. This way the collector and the core share one definition of an invalid run row.

**Contract**: `collectWeek(...).runs` has one entry per listed in-window row with an invalid ID, and at most one entry per valid ID. No new API calls are made for invalid-ID rows. `CollectedWeek` keeps its shape.

#### 2. Tests

**File**: `packages/code-reviewer/src/weekly-report-github.test.ts`

**Intent**: A runs list with two ID-less rows (`id` absent → `NaN`), two rows with `id: 0`, and one valid ID listed twice yields 4 invalid rows plus 1 valid row. Fed through `aggregateWeek`, it gives `invalidRunIds === 4`. A second case covers the alarm definition: 4 coverage-gap workflows plus 1 invalid-ID row give `coverageGapWorkflows === 4` and the alarm does not fire at the default threshold. No lookup endpoint is called for the invalid rows.

**Contract**: The new count assertion fails against today's `Set` dedup and passes after change 1. The existing "counts a duplicated run once" test keeps passing.

### Success Criteria:

#### Automated Verification:

- Collector tests pass, including invalid-ID row counting and the unchanged alarm count: `cd packages/code-reviewer && npx vitest run src/weekly-report-github.test.ts` — at planning: exit 0 — the new assertions land in Phase 2 and must be seen failing before the collector change
- Package typecheck passes: `cd packages/code-reviewer && npm run typecheck` — at planning: exit 0
- Package lint passes: `cd packages/code-reviewer && npm run lint` — at planning: exit 0
- Full package suite passes: `cd packages/code-reviewer && npm test` — at planning: exit 0 (26 files, 880 tests)
- Formatting holds for the package sources: `npx prettier --check packages/code-reviewer/src` — at planning: exit 0

**Implementation Note**: Neither phase has Manual Verification. Every claim is checked by an assertion, and the comment's rendering is unchanged. Phase 2 edits the surface of the predecessor's Manual row 2.5 (`weekly-report-github.ts`). Re-confirm 2.5 in `ai-review-weekly-report` only after this phase lands on master. A confirmation recorded earlier would read `stale`.

---

## Testing Strategy

### Unit Tests:

- Impl finding content stripped at parse time, with the count preserved; a non-object element is unreadable (Phase 1, core).
- Hostile impl finding text absent from the serialized `report.json` (Phase 1, CLI with the fake).
- Invalid-ID rows never merged, valid IDs still deduplicated, no lookups for invalid rows, and the alarm count unchanged (Phase 2, collector feeding the core).

### Integration Tests:

- None in CI. The Phase 1 local dry run is the live read-only check and needs `gh` auth.

### Manual Testing Steps:

1. Optionally run the Phase 1 dry-run command and open `<scratch>/w43/report.json`. Search it for the text of any PR #300 impl finding. Nothing should match.

## Performance Considerations

None. The change is one schema node and one guard per runs-list row.

## Migration Notes

There is nothing to migrate. Old `review.json` artifacts stay readable: their impl findings are objects, so they parse to `{}`. `report.json` artifacts already published are left to expire (see NOT doing).

## References

- Predecessor: `context/changes/ai-review-weekly-report/plan.md` (Critical Implementation Details — "Untrusted data in `review.json`"), `context/changes/ai-review-weekly-report/first-run.md`
- Subset and pin: `packages/code-reviewer/src/weekly-report.ts:91-131`
- Collector dedup: `packages/code-reviewer/src/weekly-report-github.ts:120`, `:421-462`
- Core invalid-ID rule and test: `packages/code-reviewer/src/weekly-report.ts:641`, `:791`; `packages/code-reviewer/src/weekly-report.test.ts:620-628`
- `report.json` write: `packages/code-reviewer/src/weekly-report-cli.ts:147`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Strip impl finding content at parse time

#### Automated

- [x] 1.1 Core and CLI tests pass, including the new serialized-report.json assertions — 2f4f3c3
- [x] 1.2 Package typecheck passes, so the subset pin still holds — 2f4f3c3
- [x] 1.3 Package lint passes — 2f4f3c3
- [x] 1.4 Full package suite passes — 2f4f3c3
- [x] 1.5 Formatting holds for the package sources — 2f4f3c3
- [x] 1.6 A local dry run's report.json has no impl finding keys — 2f4f3c3

### Phase 2: Never merge invalid-ID rows in the collector

#### Automated

- [x] 2.1 Collector tests pass, including invalid-ID row counting and the unchanged alarm count — 5c30ab1
- [x] 2.2 Package typecheck passes — 5c30ab1
- [x] 2.3 Package lint passes — 5c30ab1
- [x] 2.4 Full package suite passes — 5c30ab1
- [x] 2.5 Formatting holds for the package sources — 5c30ab1
