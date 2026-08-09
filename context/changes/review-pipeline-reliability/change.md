---
change_id: review-pipeline-reliability
title: Review pipeline reliability — schema-retry, backoff, dedup identity
status: impl_reviewed
created: 2026-08-08
updated: 2026-08-09
archived_at: null
---

## Notes

Deferred findings from the Codex full-plan impl-review of `ci-cd-code-review`
(see that change's `reviews/impl-review.md` F3/F4 + `verification.md`), one
coherent reliability pass over `packages/code-reviewer`:

1. **Schema-mismatch retry-once** (strongest item, quantified): classify the
   AI SDK's `NoObjectGeneratedError` ("No object generated: response did not
   match schema") as retryable in `retry.ts` — the finder (`z-ai/glm-4.6`)
   flaked its structured output on **2 of 7 live runs** (runs 31275401205 on
   `4116d17`, 31277190123 on `a5e1e6e`); a single re-roll would likely have
   saved both. Today's recovery is a manual `ai-cr:review` label.
2. **F4 — retry backoff**: `withOneRetry` re-invokes immediately; a 429 retry
   usually lands in the same rate-limit window. Add an injectable bounded
   delay honoring `Retry-After` (the SDK exposes response headers) with
   capped backoff + jitter fallback. Same file/test seam as (1) — bundle.
3. **F3 — dedup identity** (decide, don't reflex-fix): `mergeFindings`
   identity `file:startLine|category` collapses distinct same-line defects
   before the judge sees them — but the dedup exists to merge model
   rephrasings, so widening the identity (normalized-description component)
   risks duplicate noise instead. Consider measuring the actual trade with
   the `code-review-evals` promptfoo harness (next change) before choosing.

Adjacent candidate while in there: upload `review.json` as a workflow run
artifact (post-hoc finding inspection — today it dies with the runner).

**2026-08-09 — F3 dedup-identity decision (Phase 2):** the `mergeFindings`
identity stays `file:startLine|category`; we shipped measurement instead of a
reflex widen. `PipelineResult.preDedupFindingCount` (the finder's normalized
count before the merge) now rides in `review.json`, so every live run reports
how often collapse actually happens (`preDedupFindingCount − findings.length`).
The widen-or-keep call is deferred to the `code-review-evals` change, decided
on that data plus the promptfoo harness.

**2026-08-09 — live verification on PR #118 (own-PR review):** the FIRST run
(31313913408) double schema-flaked the finder and thereby live-proved the
whole change: the log shows `retrying finder after AI_NoObjectGeneratedError
in 0ms` (Phase 2 telemetry + schema→immediate-re-roll policy), the second
flake correctly rethrew (≤ 2 attempts — cost cap held), the upload step stayed
green with no output dir, and comment/labels were left untouched. The
`ai-cr:review` label re-run (31314247760) then went green end-to-end:
`ai-review-output` artifact downloadable with complete `review.json`
(incl. `preDedupFindingCount`) + `comment.md`, verdict `passed`, single
sticky comment, `ai-cr:passed` flipped. Phase 3 criteria 3.2–3.4 all met.
