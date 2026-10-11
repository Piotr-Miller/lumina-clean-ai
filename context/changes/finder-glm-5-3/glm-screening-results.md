# GLM finder screening — results (2026-10-11)

A screening, not a gate: fixture rows only, small n, run from a scratch directory without a change folder. It
justified opening this change (owner, 2026-10-11). Raw artifacts kept outside git; configuration in
`screening-config.md`.

## Setup

- **Eval:** `packages/code-reviewer/evals` (promptfoo 0.122.0), the production finder prompt and its fixture cases,
  graded by `google/gemini-3.1-pro-preview`.
- **Finder code:**
  - Pass 1 used `master`'s finder (`response_format` json_schema).
  - Passes A–D used the two-stage finder of the sealed `finder-verification` worktree (`9c85aa2`, commits `802a1e0`,
    `15b3f71`), which carries the format in the prompt and parses on our side. The worktree was not modified
    (`git status` empty after every run).
- **Scratch wrappers** (`glm-provider*.ts`, see `screening-config.md`): the repo provider unchanged, plus a `reasoning` override
  injected into each OpenRouter chat request and a wire log (`wire*.jsonl`: provider, tool calls,
  reasoning tokens, cost per response).
- **Passes B–D** used `finder-provider-long.ts`, a copy of the sealed provider with one change: the finder
  budget is 900 s instead of 300 s.
- **Routing:**
  - passes A–D: `OPENROUTER_FINDER_PROVIDERS=z-ai,fireworks,together`; every response was served by Z.AI;
  - pass 1: `master`'s default routing (Baidu for glm-5.1, AkashML for glm-5.3).

## Results

| Pass | Eval id                        | Model, reasoning                 | Finder           | Rows                        | Outcome                                                                                 | Cost      |
| ---- | ------------------------------ | -------------------------------- | ---------------- | --------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 1    | `eval-tON-2026-10-11T17:34:55` | glm-5.1, `enabled: false`        | master           | cross-hunk ×1               | fail: 0 tool calls, planted flaw missed                                                 | $0.0027   |
| 1    | same                           | glm-5.3, default (`max`)         | master           | cross-hunk ×1               | error: fetched the right file, then "No object generated: could not parse the response" | $0.0466   |
| A    | `eval-URn-2026-10-11T17:38:32` | glm-5.3, `enabled: true` (`max`) | two-stage, 300 s | cross-hunk ×1, clean ×1     | clean pass (0 critical/major); cross-hunk error: 300 s budget exceeded after 2 fetches  | $0.1346   |
| B    | `eval-o65-2026-10-11T17:53:06` | glm-5.3, `effort: low`           | two-stage, 900 s | cross-hunk ×1, clean ×1     | 2/2 pass                                                                                | B–D total |
| C    | `eval-44r-2026-10-11T17:54:10` | glm-5.3, `effort: low`           | two-stage, 900 s | cross-hunk ×2, clean ×2     | 4/4 pass                                                                                | B–D total |
| D    | `eval-Mxt-2026-10-11T17:55:06` | glm-5.3, `effort: low`           | two-stage, 900 s | canary, React, hardening ×2 | 4/4 pass                                                                                | $0.1211   |

Pass 1's cost includes $0.0054 for grading. Pass A's cost is from the wire log and is undercounted, because the
timed-out row's last response was not logged with a cost.

**glm-5.3 at `effort: low`, per row:**

| Case                                      | n   | Result                                  | Tool calls                          | Latency | Cost / row   |
| ----------------------------------------- | --- | --------------------------------------- | ----------------------------------- | ------- | ------------ |
| Cross-hunk contract violation             | 3   | 3/3 pass                                | the out-of-hunk file delivered, 3/3 | 34–44 s | $0.008–0.015 |
| Defect-free rename (tool-enabled)         | 3   | 3/3 pass, 0 critical/major              | 0/3 (not needed)                    | 9–11 s  | $0.002–0.007 |
| JS loop canary                            | 1   | pass                                    | —                                   | 4 s     | $0.003       |
| React 16→19 migration (3 planted flaws)   | 1   | pass                                    | —                                   | 24 s    | $0.010       |
| Hardening, defences present (fabrication) | 1   | pass: only minor/nit; one format repair | —                                   | 14 s    | $0.007       |
| Hardening, one genuine traversal defect   | 1   | pass: reported as major                 | —                                   | 6 s     | $0.004       |

**Total screening spend:** $0.0547 + $0.1346 + $0.1211 = **$0.310**. These are the costs reported in the responses.
The key counter lagged at the last read (+$0.073 at 17:55:45Z for passes B–D).

## Reading

- **Tool use:** with reasoning on, glm-5.3 is the first GLM observed fetching out-of-hunk context. glm-4.6, glm-5.2
  (2026-08-11, 0/6) and glm-5.1 with reasoning off (pass 1) never did.
- **Effort:** `effort: low` kept that behaviour and brought rows under 45 s and $0.015. The `max` default spent up
  to ~8,800 reasoning tokens per call and exceeded the 300 s budget.
- **Parsing:** `master`'s finder cannot parse glm-5.3's answer (pass 1). The two-stage finder parsed every answer,
  with one repair.

## Limits

- **Fixtures do not predict live behaviour.** `deepseek-v4-flash` fetched on 6/6 fixture rows and 0/3 live runs
  (`packages/code-reviewer/evals/README.md`). The deciding test is a live PR probe (e.g. #269) under the
  `finder-model-swap` gates.
- **Small samples:** n = 3 on the two tool-enabled cases, n = 1 elsewhere.
- **The finder is half the system.** Stages 1 and 2 of the frozen-findings verifier
  (`context/archive/2026-10-09-finder-verifier-frozen/`, `context/archive/2026-10-10-finder-verifier-frozen-sonnet/`)
  showed the verifier confirms false claims, whatever the finder.
- **A configuration that does not ship today.** Shipping glm-5.3 needs the two-stage finder merged and the finder's
  `reasoning: {enabled: false}` changed to `effort: low`. glm-5.3 has `reasoning.mandatory: true`.
