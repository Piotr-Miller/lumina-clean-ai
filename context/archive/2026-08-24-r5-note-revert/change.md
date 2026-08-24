---
change_id: r5-note-revert
title: "Revert the finder truncation note — its live check found the tool channel inert"
status: archived
archived_at: 2026-08-24T18:10:00Z
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Executes the pre-registered decision rule from
`context/archive/2026-08-22-r5-finder-truncation-note/decision.md`
(Disposition #1): _"An inert tool-enabled channel → REVERT the note as its own
change."_

## Why now — the check was executable, not pending

The check was recorded as passive ("wait for the next naturally oversized PR").
It turned out to have been firing for weeks: **five of the last 40 merges
exceeded 100 KB in the reviewed diff, three of them with source over the cap.**
The evidence was already sitting in the `ai-review-output` artifacts.

## Evidence — three qualifying PRs, all criteria recorded

| PR   | AI-review run | note fired                                       | `getFileContext` calls | M1-rewrite                             |
| ---- | ------------- | ------------------------------------------------ | ---------------------- | -------------------------------------- |
| #175 | `32722423900` | ✅ `diffTruncated: true`, metadata named 7 files | **0**                  | none (0 findings)                      |
| #176 | `32727518229` | ✅ metadata named 9 files                        | **0**                  | none (0 findings)                      |
| #177 | `32733607820` | ✅ metadata named 7 files                        | **0**                  | none of 7 findings is an absence claim |

The named files included **real invisible source** —
`packages/code-reviewer/scripts/fabrication-probe.mjs`,
`build-fabrication-fixture.mjs`, `fabrication-grade.mjs` — not just prose.

**The tool was demonstrably available**, so this measures the channel rather
than its absence: the run log shows `--source-root` passed and the CLI printing
`finder step 1: no getFileContext call`. The finder had the tool, was told
which files it could not see, and fetched nothing. Three times.

Combined with the note's already-measured tool-less effect (NIL — M1 findings
10, m1Runs 5/20, identical to the no-note baseline), **every channel the note
could have acted through is now measured, and none of them moved.**

## What changed

Removed — the finder-specific note and its plumbing:

- `TRUNCATION_NOTE` and the `<truncation-metadata>` fence (`prompts.ts`)
- `truncationMetadataPayload`, `TRUNCATION_METADATA_MAX_FILES`
- the fetch-first sentence in `buildInstructions`' tool branch
- `truncated` / `cutFile` / `overCapFiles` on the diff `ReviewUnit`
- `truncationReport` and its pipeline wiring
- `TruncationMetadata` and `PipelineResult.truncationMetadata`

Kept, deliberately — none of it was measured inert:

- the **100 KB cap** (`DIFF_CAP_BYTES`, `capDiff`)
- the **`diffTruncated`** flag in `review.json`
- the **human-facing warning** in the rendered comment
- the **implementation-review pass's own `diffTruncated` note** (a different
  pass, born from PR #143's three fabricated CRITICALs, never measured inert)
- **source-before-prose ordering** (`orderDiffForCap`)
- `computeFileSegments` / `computeManifest` — used by the ordering and the
  fabrication probe

## Instrument follow-on

`buildProbeReviewUnit` no longer attaches truncation facts, so every probe run
is pre-note-equivalent by construction and the instrument again matches
production byte-for-byte. `--pre-note` is accepted as a **no-op** (with a
warning) so the commands written into archived `verification.md` files still
run.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test` — **596 passed**.
- Note-specific suites replaced by **reverted-state guards**: the diff prompt
  must contain no truncation channel; the finder unit must be exactly
  `{kind, diff}` even on an oversized diff while `diffTruncated` stays true;
  the tool branch keeps its cross-hunk guidance but not the metadata sentence.
- Kept surfaces verified present (cap, `diffTruncated`, rendered warning,
  impl-review note, ordering).

## Not in scope

The **zero-findings-on-400KB+ observation** (two of the three qualifying runs
returned no findings at all) is a separate review-reliability question and is
deliberately **not** part of this rationale. Recorded here only so it is not
lost.
