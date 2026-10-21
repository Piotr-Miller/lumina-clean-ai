# Live probe — first `ai-review` run after the flip

> Change `ai-review-reenable`, Phase 4 (plan.md § Definitions, "Live probe passes"). Recorded 2026-10-21.

## Verdict

**PASS.** The finder ended without `FinderOutputError` and without 429 exhaustion. The sticky comment was posted,
and exactly one `ai-cr:*` label is set. **Disposition:** the job stays enabled, `false &&` stays removed, and row 4.6
is not applicable.

## Run

| Field         | Value                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run           | [39653424585](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/39653424585), `pull_request` `opened` on [PR #300](https://github.com/Piotr-Miller/lumina-clean-ai/pull/300) |
| Head SHA      | `3516d86bb773e5215424c917d52e6ce8d45924a4`                                                                                                                                              |
| Conclusion    | `success`; every step green, `SKIP_REVIEW` not taken (the diff has code)                                                                                                                |
| Plan resolved | `context/changes/ai-review-reenable/plan.md` (32,074 chars)                                                                                                                             |
| Models        | finder `z-ai/glm-4.6`, judge `anthropic/claude-sonnet-5`                                                                                                                                |

## Finder requests (from the run log, T2 lines included)

| Step | Kind                                      | `getFileContext` targets                                | `provider=` | `finish=`  | T2 text                                                                          |
| ---- | ----------------------------------------- | ------------------------------------------------------- | ----------- | ---------- | -------------------------------------------------------------------------------- |
| 1    | gathering                                 | `reviewer.ts:1-60`, `pipeline.ts:1-60`, `retry.ts:1-60` | Novita      | tool-calls | 221 chars, the model's plan to fetch files                                       |
| 2    | gathering                                 | `reviewer.ts:60-200`, `pipeline.ts:60-160`              | Novita      | tool-calls | empty (0 chars)                                                                  |
| 3    | gathering                                 | `reviewer.ts:200-350`, `pipeline.ts:160-350`            | Novita      | tool-calls | empty (0 chars)                                                                  |
| 4    | gathering                                 | `reviewer.ts:350-500`, `pipeline.ts:350-550`            | Novita      | tool-calls | empty (0 chars)                                                                  |
| 5    | gathering, the forced tool-less last step | none                                                    | Novita      | stop       | 227 chars: a raw `<tool_call>getFileContext…</tool_call>` markup emitted as text |
| 6    | finalization                              | none                                                    | Novita      | stop       | 5,186 chars, a ` ```json ` fenced review (the parser strips the fence)           |

- **Parse outcome:** pass on the finalization. No `finder format repair requested` line and no `retrying` line, so
  there was no repair and no retry.
- **T2 caught something on its first live run.** On step 5 the forced tool-less step, glm-4.6 on Novita wrote
  a tool call as plain text instead of calling the tool. It was harmless here, because the finalization still
  produced a valid review. Before T2 this would have been invisible. If it ever precedes an empty review, it is the
  first place to look.

## Output

| Field                 | Value                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verdict               | `passed`, 6 findings (`verdict=passed findings=6` in the log)                                                                                                           |
| Sticky comment        | [issuecomment-6323624083](https://github.com/Piotr-Miller/lumina-clean-ai/pull/300#issuecomment-6323624083) by `github-actions`                                         |
| Label                 | `ai-cr:passed`, the only `ai-cr:*` label (`+ai-cr:passed -ai-cr:failed`)                                                                                                |
| Implementation review | APPROVED, 2 findings (P1 WARNING: rows 4.2–4.4 had no SHA yet, the normal mid-phase state before this phase's commit; P2 OBSERVATION: the diff was truncated at 100 KB) |
| Cost                  | finder **$0.076460**, judge **$0.027728**, impl **$0.228852**, total **$0.333040** per full run on this PR                                                              |

**Cost source.** The cost comes from the run log's `review cost:` line, which the CLI prints from
`finderTelemetry.cost`, `judgeTelemetry.cost` and `implReviewTelemetry.cost` (`packages/code-reviewer/src/cli.ts`,
`formatCostLine`). The `ai-review-output` artifact was not downloaded in this session; it is retained for 14 days.

## Quality note (the owner's separate read)

The probe does not grade quality (Definitions). One observation for that read: the only finding the comment files as
a correctness issue, **F2**, is false. It claims that `\p{Cc}` does not match C1 controls such as U+0085, but
`\p{Cc}` covers U+0080–U+009F, and `cli.test.ts` already asserts that `\u0085` is escaped. The remaining findings are
nits. This matches the outage change's hand-read of novita: plausible-sounding, partly false.
