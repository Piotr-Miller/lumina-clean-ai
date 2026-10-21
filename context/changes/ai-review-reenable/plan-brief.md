# Re-enable advisory AI review with the ported finder fix — Plan Brief

> Full plan: `context/changes/ai-review-reenable/plan.md`

## What & Why

Turn `ai-review` back on, as the owner decided on 2026-10-21. That reverses the 2026-10-19 close-out of
`advisory-review-analysis`. The job was switched off on 2026-10-04 because the finder failed on every PR: Venice,
the only endpoint serving glm-4.6's structured output, stopped applying `response_format`. A measured fix for that
exists, but it was never merged.

## Starting Point

- **`master`:** the job sits behind `false &&`. The finder still asks the provider for structured output.
- **`feat/finder-serialization-outage` (`87ba5da`):** holds a two-stage finder with its own parser and novita
  routing. It parsed 10 of 10 on three endpoints, including Venice. novita failed the quality hand-read.
- **Merge state:** `packages/code-reviewer` on `master` is unchanged since that branch's merge-base, so the port is
  conflict-free.

## Desired End State

- PRs get the advisory review again from the ported finder. Each finder request leaves a bounded text line in the
  Actions log.
- `review.yml` and `AGENTS.md` describe the actual state and name this change.
- `probe.md` records the first live run. If that run failed, the job is off again with the reason recorded.

## Key Decisions Made

| Decision                 | Choice                                                                    | Why                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Finder model and routing | `z-ai/glm-4.6` via novita, unchanged variables                            | The fix as measured; cheapest at about $0.02 per PR. The owner accepts novita's hand-read quality risk. |
| Budget                   | Owner raises the OpenRouter key limit before the flip                     | Last recorded headroom was $0.54, about two PRs with plans.                                             |
| Process                  | New change with a plan                                                    | The re-entry rule the repo stated on 2026-10-19                                                         |
| Probe pass               | Review parses, comment posted, one `ai-cr:*` label; `findings: []` passes | Tests what the port fixes. Quality is the owner's separate read.                                        |
| Probe failure            | Restore `false &&` in the same PR and merge the rest                      | `master` never carries a job known to fail on every PR.                                                 |
| T2                       | Included, test-first                                                      | An empty review must be attributable from the public log.                                               |
| Port scope               | `src/` and `evals/` byte-identical to `87ba5da`; gate scripts not ported  | `evals/` compiles against `src/`; the scripts are standalone measurement tooling.                       |

## Scope

**In scope:**

- the port;
- T2;
- the JSONL diff exclusion;
- the `review.yml` and `AGENTS.md` texts;
- the flip and the live probe with its record.

**Out of scope:**

- model or routing changes;
- a quality gate;
- making the check required;
- the gate scripts;
- editing archives.

## Architecture / Approach

The finder becomes a tool loop that only gathers context, followed by one tool-less request that writes JSON. We
parse that JSON strictly and allow at most one format repair. The judge and the implementation review are
unchanged. The PR that removes `false &&` is reviewed by its own workflow, so the first live run happens before
merge.

## Phases at a Glance

| Phase                            | What it delivers                                           | Key risk                                        |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| 1. Port the two-stage finder     | `src/`, `evals/` from `87ba5da`; package gate green        | The branch has no CI record; local gate only    |
| 2. T2 log line (test-first)      | One bounded, escaped text line per finder request          | Leaking model text into the comment (tested)    |
| 3. Pointers that hold either way | JSONL exclusion, root-cause comment, AGENTS retry sentence | Touching a guard line (pinned by 3.2, 3.3)      |
| 4. Flip and probe live           | Guard removed, status texts, `probe.md`                    | novita 429s or a parse failure → guard restored |

**Prerequisites:** the owner raises the OpenRouter key limit and credit before Phase 4, and gives the go for push
and PR.
**Estimated effort:** about one to two sessions. Phase 4 waits on the live run, about 5 minutes per push.

## Open Risks & Assumptions

- novita's findings were judged poor in the outage gate: 10 of 50 rejected. The comments may be noisy.
- Each post-flip push is a paid review, about $0.22 with the implementation pass.
- The branch's suite has only local evidence. The first CI run of the ported code is this PR's.
- The advisory-review analysis found 0 of 55 accepted findings worth a fix. Re-enabling is an owner decision, not
  new evidence of value.

## Success Criteria (Summary)

- The package gate is green with the ported finder and T2.
- The live probe is executed and `probe.md` records its result and disposition: a pass leaves the job enabled;
  a failure restores the guard and records the cause, including any unavailable evidence.
- Both documents tell an agent the truth about whether `ai-review` runs.
