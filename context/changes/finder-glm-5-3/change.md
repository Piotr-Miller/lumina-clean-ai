---
change_id: finder-glm-5-3
title: "Measure glm-5.3 (reasoning low) as the ai-review finder, live PR probe included"
status: implementing
created: 2026-10-11
updated: 2026-10-14
archived_at: null
---

## Notes

2026-10-14: confirmed 3.5 — accepted at 674fb79d2ecf79553b0e5f83dbd0856f7f2e8d34. Explicit owner confirmation through `/rune-implement`; recording preflight returned `recordable`. The owner accepts the dry-run sheet format as the instrument for hand-read.

2026-10-13: re-confirmed 2.7 — was accepted (no revision); accepted at b6afeb193255ff875a53e0e9254d68942c3f5730. Explicit owner confirmation through `/rune-implement`; recording preflight returned `recordable`. Previous legacy mark: verified by Codex at the owner's explicit request, 2026-10-13, after the F1–F6 fixes in the working tree.

— measure z-ai/glm-5.3 (reasoning effort low) as the ai-review finder with the two-stage finder, under the finder-model-swap gates including a live PR probe; carries the 2026-10-11 screening results

2026-10-11: owner decision — the screening result justifies a new change (this one), which qualifies decision 5.7 of `finder-verifier-frozen-sonnet` ("no further model swap now"). Screening results: `glm-screening-results.md`; raw artifacts in `screening/` (uncommitted; they contain absolute local paths — inspect before committing).

2026-10-11: owner decision (scope) — the change **includes merging the two-stage finder** (`feat/finder-verification` commits `802a1e0`, `15b3f71`; finder only, **without the verifier**) and switching the finder's reasoning from `{enabled: false}` to `effort: low`. **Success restores AI review:** if glm-5.3 passes the `finder-model-swap` gates, including the live PR probe, this change removes the `false &&` line from `.github/workflows/review.yml` (R11, 2026-10-04, `:23-29`: "the change that deploys a finder which passes those gates removes the `false &&` line"). A failure leaves AI review disabled and the two-stage finder unmerged unless the plan says otherwise.

2026-10-11: owner decisions on `research.md` § Open Questions (binding inputs for the pre-registration):

1. **Restoration gate:** G1–G5. Hand-read: at most **ceil(0.05 × N)** rejected findings **per valid run**; unresolved = rejected; every finding is classified, with no deduplication across runs. **D2 in every valid #269 run.** Add **two #247 runs**. **G2 stays strict** (5/5 empty). **G5 executes the actual GitHub `AI Code Review` workflow**; this change updates the `review.yml` comment to reference this sealed gate.
2. **Reasoning:** `{enabled: true, effort: "low"}` on every finder request (loop, finalization, repair). Reasoning text stays out of parsing, transcripts, logs and published artifacts. The 16,384 output-token limit and the 300 s timeout stay; truncation fails the attempt. No claim of a separate reasoning-token cap that has not been verified.
3. **Cost gate:** the per-attempt G4 ceiling is replaced by **≤ $10/month**, a size-weighted projection that includes finder, judge, retries and implementation review.
4. **Routing:** option A — port the finder-routing commits (`e5be9ff`, `b3a4a38`) and replace Novita with `z-ai,fireworks,together`; fallback only within that list; routing stays finder-specific. The owner deletes `vars.OPENROUTER_REVIEW_MODEL` before G5; the actual model and providers are verified in telemetry.
5. **Budget and artifacts:** **$4.00 total**, including **$0.50 reserved for G5**; pause at **$3.00** of measurement spend for reconciliation; budget exhaustion = `INCOMPLETE`. Raw `screening/` stays out of git; the summary, the reproducible configuration and sanitized metadata are committed.

2026-10-11: owner decisions during `/rune-plan`:

6. **Valid run:** a run in which the finder succeeds but the judge fails (red review) is an **invalid run** — it counts in G1 and is not hand-read.
7. **Budget amended:** **$4.50 total** — measurement pauses for reconciliation at **$3.00** and stops hard at **$3.50**; **G5 reserve $1.00** (the G5 estimate for this PR is $0.45–0.95). This supersedes the $4.00 / $0.50 split in decision 5.

2026-10-11: owner clarification during `/rune-plan-review`, F1 — decision 6 means a **technical judge failure (no completed verdict)**. A completed `verdict: "failed"` does not itself invalidate a run; all other validity and hand-read criteria still apply. The plan and runner test requirements distinguish both cases.

2026-10-11: owner decision during `/rune-plan-review`, F2 — monthly cost is **provisional before G5**. Once m247 and m269 are final, early rejection uses only **53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00**; equality does not reject. The earlier A6 stop after #247 stays unchanged. Otherwise final cost is decided after G5 with the agreed update of I; a skipped impl-review keeps I = $0.199620. The spend budget and other gates still apply.

2026-10-11: owner decision during `/rune-plan-review`, F3 — the manifest explicitly includes G3's `packages/code-reviewer/evals/review-result.schema.json` and `.github/ai-review-rules.md`. Their hashes are checked before every paid step, and hermetic tests must show that changing either file blocks preflight and spending.

2026-10-11: owner decision during `/rune-plan-review`, F4 — File declarations use full repo-relative paths, enumerated files instead of brace notation, and the results directory instead of a glob. All 14 Manual Verification criteria now declare explicit surfaces. Criterion wording and Progress IDs, titles and marks are preserved; acceptance-state resolves all 14 surfaces, with all Manual rows still pending.

2026-10-11: owner decision during `/rune-plan-review`, F5 — add mixed-condition test requirements for step, finalization and repair responses containing `<think>REASONING-SENTINEL</think>` with `finishReason: "length"`. The attempt fails without retry; the sentinel must be absent from stderr and step summary regardless of guard ordering.

2026-10-13: owner decision — G3 rows include production's single retry, prove the reasoning shape by wire capture of each finder request's `reasoning` key, and fail on a request without a provider-reported accepted model; plan.md Phase 3 § 2 (G3 rows) Contract.

2026-10-14: owner decision — a confirmed OpenRouter HTTP 401/402 (the CLI's typed `api error: status=<n>` line; for G3, the finder error's typed status) stops the series INCOMPLETE (auth/credit), is not a G2, #247 or G1 sample, and resumes only under a dated amendment; auth/credit text without a status is only suspected (invalid, unsettled); a grader 401/402 stays a grader error; plan.md § Definitions "auth/credit stop", Phase 3 §1 runner contract, Phase 4 Stops, Testing Strategy.

2026-10-14: reopened 2.7 — was accepted at b6afeb193255ff875a53e0e9254d68942c3f5730; changed: packages/code-reviewer/src/cli.ts
