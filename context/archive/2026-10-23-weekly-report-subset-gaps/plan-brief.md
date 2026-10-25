# Weekly Report Subset Gaps — Plan Brief

> Full plan: `context/changes/weekly-report-subset-gaps/plan.md`

## What & Why

This change closes two low-risk input gaps in the AI review weekly report (`packages/code-reviewer`):

- **Impl finding text leaks.** `implReview.findings` is parsed as `z.unknown()`, so each finding's `title`/`detail`/`fix` reaches `report.json`. That file is uploaded as a 90-day artifact. The predecessor plan promised a narrow subset of `review.json`.
- **Invalid-ID rows collapse.** The collector deduplicates runs with a `Set`. That `Set` treats every `NaN` ID (and every other repeated invalid value) as one row, so the "invalid run ID" warning undercounts.

## Starting Point

The core already strips top-level finding text and counts every invalid-ID row once. The gaps are one schema node (`weekly-report.ts:108`) and one dedup guard (`weekly-report-github.ts:423-426`). Both were confirmed by a scratch probe at planning. No test sees them: the CLI test checks only `report.md`, and the fixtures carry no impl finding text.

## Desired End State

`report.json` keeps only the impl finding count, as `{}` elements, and holds no finding text. `report.md` is unchanged. Each ID-less row counts once on the warning line. Coverage-gap counts and alarm decisions do not move.

## Key Decisions Made

| Decision                                      | Choice                                                      | Why (1 sentence)                                                                                                                                  | Source                    |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| How to count two ID-less rows                 | Each row separately, never merged                           | Matches the core's existing rule and test, and the warning's "rows" wording; a warning must not shrink silently.                                  | Plan (user)               |
| Do ID-less rows feed the coverage alarm?      | No, warning line only                                       | Keeps the F4 alarm definition the owner settled (distinct workflow IDs); no AGENTS.md or alarm-body change.                                       | Plan (user)               |
| Model ids in `report.json`                    | Out of scope                                                | They come from workflow config, not PR diff content, and the comment already filters them.                                                        | Plan (user)               |
| Impl findings schema shape                    | `z.array(z.object({}).transform((value): object => value))` | Zod strips every key; widening the output to `object[]` preserves the compile-time `PipelineResult` pin, which a bare empty-object schema breaks. | Plan review F1 (verified) |
| Already-uploaded W43 artifacts                | Left to expire                                              | The same text is already public in the PR comment and the `ai-review-output` artifact.                                                            | Plan (assumed)            |
| `change.md` claim "undercounts coverage gaps" | Corrected: only `invalidRunIds` is affected                 | Invalid-ID rows never enter `coverageGapWorkflows` (`weekly-report.ts:641`, `:764`).                                                              | Plan (code)               |

## Scope

**In scope:**

- The impl finding schema in `reviewJsonSubset`, with core and CLI tests that assert on the serialized `report.json`.
- The collector dedup guard, with a collector→core test for the invalid-row count and the unchanged alarm count.

**Out of scope:** model id sanitising; invalid-ID rows in the alarm; deleting published artifacts; render, workflow and AGENTS.md changes; editing the predecessor's plan.

## Architecture / Approach

There are two phases, one per gap, each a separate commit. Each phase writes its failing regression test first: the serialized-JSON assertion in Phase 1, the two-`NaN` row count in Phase 2. Then it fixes the parse or collect edge. Nothing downstream changes, because the core reads only impl `.length`, and invalid rows already reach a lookup-free branch.

## Phases at a Glance

| Phase                                           | What it delivers                         | Key risk                                                                                                         |
| ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1. Strip impl finding content at parse time     | `report.json` without impl finding text  | Editing the shared fake `reviewJson` may move existing impl-count assertions. Isolate the hostile finding if so. |
| 2. Never merge invalid-ID rows in the collector | One row per invalid ID reaching the core | Phase 2 edits the surface of predecessor Manual row 2.5. Re-confirm 2.5 only after this lands.                   |

**Prerequisites:** none. Optional `gh` auth for the read-only W43 dry-run check (1.6).
**Estimated effort:** about one short session across 2 phases.

## Open Risks & Assumptions

- A non-object impl finding element now makes an artifact `artifact unreadable`, where today it is read. Only forged data has that shape. This matches how top-level findings already behave.
- Predecessor Manual rows 1.5, 2.5, 3.5 and 3.6 are `unverifiable` after the rebase-merge. 2.5 shares a file with Phase 2, so order its re-confirmation after this change.

## Success Criteria (Summary)

- A weekly report's `report.json` contains no impl finding title, detail or fix text, and its counts and `report.md` are unchanged.
- Two rows without a run ID show as "2 rows" on the warning line, and the coverage alarm count is unchanged.
