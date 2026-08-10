# Phase 3 — Live verification: finder file context

Date: 2026-08-10. All runs on the `AI Code Review` workflow (PR-triggered, advisory).
Evidence preserved here because the `ai-review-output` artifacts expire after 14 days.

## 1. Feature PR — plain live signal (criterion 3.2)

**PR:** https://github.com/Piotr-Miller/lumina-clean-ai/pull/120

| Run                                                                                     | Result     | Note                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [31423673980](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31423673980) | ❌ failure | Review computed fine (verdict + artifact); a **transient runner TLS error** (`x509: certificate is not valid for any names` against api.github.com) killed the sticky-comment upsert. |
| [31425307805](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31425307805) | ✅ success | `ai-cr:review` retry label path worked as designed. Verdict `passed` (3 minors), sticky comment posted, `ai-cr:passed` flipped. **3.2 evidence run.**                                 |

Telemetry line observed in the log (wiring proof; the model making no tool call on this diff is
explicitly not a pass/fail criterion here):

```
finder step 1: no getFileContext call (tokens in=26770 out=388 total=27158)
```

`finderTelemetry` in the `ai-review-output` artifact (run 31423673980):
`{"steps": 1, "toolCalls": 0, "inputTokens": 26770, "outputTokens": 691, "totalTokens": 27461}`.

## 2. Planted-flaw scratch PR (criteria 3.3 + 3.4)

**PR:** https://github.com/Piotr-Miller/lumina-clean-ai/pull/121 (closed, branch deleted — never merged)

**The plant:** `src/lib/engines/canvas-helpers.ts` — `flattenToRgbJpeg` re-encode quality changed
from the shared `JPEG_QUALITY` (0.92) to a hardcoded `0.5` with a plausible cover comment. The
wrongness is only visible via the module header ("single-source the JPEG re-encode quality so the
two Canvas paths can't silently drift apart") and the function's own docstring ("re-encodes at the
shared {@link JPEG_QUALITY}") — both **outside the hunk**.

It took seven runs to land the proof; each failure taught something real:

| Run                                                                                     | Config                                              | Outcome                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [31425150007](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31425150007) | glm-4.6, 5 steps                                    | Diff was 106,451 B → **capDiff truncated at 100 KB**; `src/` sorts last, so the flaw hunk never reached the finder (input tokens identical to the feature run betrayed it). Verdict passed. |
| [31425570933](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31425570933) | glm-4.6, docs dropped from branch (diff 58,869 B)   | Flaw visible. **0 tool calls**; only a shallow in-hunk minor ("0.5 might be too aggressive") — no contract link.                                                                            |
| [31426083399](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31426083399) | glm-4.6 + strengthened tool instruction (`09e6e03`) | Still **0 tool calls**. glm-4.6: 4/4 runs without a single tool call.                                                                                                                       |
| [31426592300](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31426592300) | sonnet-5 pinned (scratch-only workflow pin)         | **6 getFileContext calls** incl. `canvas-helpers.ts:1-90` — but all 5 steps went to fetches → `No output generated.` → exit 1.                                                              |
| [31427102967](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31427102967) | sonnet-5, `finder-max-steps: "8"`                   | All 8 steps on fetches — same technical failure. Budget alone doesn't fix a fetch-happy model.                                                                                              |
| [31427947145](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31427947145) | + `prepareFinalStep` guard (`f4d6666`)              | **OpenRouter credits exhausted** mid-probe (funds, not code).                                                                                                                               |
| [31428446096](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31428446096) | sonnet-5, 8 steps, guard, credits topped up         | ✅ **Full proof** (below).                                                                                                                                                                  |

**The proving run** ([31428446096](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31428446096)):

```
finder step 1: getFileContext src/lib/engines/canvas-helpers.ts:1-90, getFileContext .github/workflows/review.yml:1-100 (tokens in=30586 out=751 total=31337)
finder step 2: no getFileContext call (tokens in=34407 out=11597 total=46004)
verdict=failed findings=2 (finder=anthropic/claude-sonnet-5, judge=anthropic/claude-sonnet-5)
```

- **(a) Tool called:** 2 `getFileContext` calls in step 1, including a full read of the flaw file.
- **(b) Cross-context flaw found:** major finding at `src/lib/engines/canvas-helpers.ts:71` quoting
  the module header and the `{@link JPEG_QUALITY}` docstring — text that exists only outside the
  hunk, i.e. it demonstrably came through the tool:
  > "The module's own header doc states its purpose is to 'single-source the JPEG re-encode quality
  > so the two Canvas paths can't silently drift apart' […] this change directly contradicts both,
  > degrading visual quality substantially for the alpha-flatten recovery path"
- **(c) Allowlist held:** every requested path across all runs (`canvas-helpers.ts`, `review.yml`,
  `reviewer.ts`, `pipeline.ts`, `cli.ts`, `cli.test.ts`) was a diff path; no out-of-diff request
  was served (one inverted range `195-150` was absorbed by the clamp — never-throw held).
- Bonus: the second major finding flagged the scratch-only model/step pin in `review.yml` as debug
  config that must not merge — the reviewer polices probe hygiene by itself.

## 3. Cost delta (criterion 3.5)

| Run                                                 | Finder tokens (in / out / total) |
| --------------------------------------------------- | -------------------------------- |
| Tool-less baseline, same diff (glm, 31426083399)    | 17,534 / 1,302 / **18,836**      |
| Tool-less baseline, feature diff (glm, 31423673980) | 26,770 / 691 / **27,461**        |
| Tool-loop proof (sonnet, 31428446096)               | 64,993 / 12,348 / **77,341**     |

Ratio: **≈2.8×** vs the feature-diff baseline (within the ~3× budget), **≈4.1×** vs the same-diff
baseline (above it). The same-diff figure is confounded by the model swap — sonnet wrote 12.3k
output tokens vs glm's ≤1.3k, and the probe ran a doubled 8-step budget. Verdict: recorded and
acceptable — production keeps glm-4.6 + default 5 steps (today: zero tool calls → zero extra
cost), and `finder-max-steps` is the cost lever when a tool-capable finder is adopted.

## 4. Surprises (and what they produced)

1. **glm-4.6 never calls the tool** — 4/4 runs, even with the strengthened instruction. The
   shipped feature is fully wired but inert under the production finder. Follow-up decision:
   keep glm tool-less vs adopt a tool-capable finder (cost table above is the input).
2. **Fetch-happy models die at the step budget** — "No output generated" is a technical failure,
   not a degraded verdict. Fixed in-package: `prepareFinalStep` strips tools on the last allowed
   step (`f4d6666`, unit-pinned).
3. **The 100 KB diff cap silently hides tail files** — `src/` sorts after `.github/`, `context/`,
   `packages/`, so app-code hunks are the first to vanish on big PRs. The sticky comment does
   carry the truncation note, but path-order bias is worth knowing.
4. **Committed review docs pollute the review** — the first feature-PR run echoed our own
   `impl-review` reports (describing already-fixed pre-fix states) back as critical findings.
5. **Transient infra failures behave as designed** — a runner TLS flake and a credits outage both
   left the previous label/comment intact (add-before-remove) and the `ai-cr:review` label retried
   cleanly.
6. **Duplicate workflow key = invalid workflow file** — merging the feature branch's
   `finder-max-steps: ${{ vars.… }}` into a scratch branch that already pinned it produced a
   phantom failed push-run with no jobs.

## 5. Phase-3-born changes on the feature branch

- `09e6e03` — finder prompt: cross-hunk dependency class spelled out (signature/constant/module
  contract defined outside the hunk → fetch before judging).
- `f4d6666` — `prepareFinalStep`: tool-less final step so the structured review always gets
  emitted; extracted pure + unit test.

Both are plan addenda discovered by this phase's live probes; the knobs delivered in phase 2
(`review-model`, `finder-max-steps`, telemetry lines, artifact) were all exercised live by the
probe sequence above.
