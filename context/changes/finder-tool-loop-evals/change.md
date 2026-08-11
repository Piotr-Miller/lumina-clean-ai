---
change_id: finder-tool-loop-evals
title: Eval tool-loop wiring + finder-model decision
status: impl_reviewed
created: 2026-08-10
updated: 2026-08-11
archived_at: null
---

## Notes

Eval tool-loop wiring + finder-model decision (fixture-backed getFileContext source for the promptfoo model matrix; resolve glm-4.6 tool-inertia found in finder-file-context phase 3)

**Why one change, not two.** The eval follow-up and the finder-model question fused during
`finder-file-context` phase 3: the production finder (glm-4.6) made ZERO getFileContext calls in
4/4 live runs, so the tool feature is fully wired but inert under the current model. A
fixture-backed source in the eval matrix is exactly the instrument that answers "which finder
actually uses the tool, at what quality gain and cost" — offline, repeatably, without the live
scratch-PR probe cycle phase 3 had to run (7 CI runs, one evening, paid OpenRouter credits, and a
throwaway PR per hypothesis).

**Decision trail** (where the original scoping was recorded):

- `context/changes/finder-file-context/plan.md` → "What We're NOT Doing": eval harness stays
  tool-less (`evals/finder-provider.ts`, `fileContextTool: false`); fixture-backed source = a
  recorded follow-up change (this one).
- `context/changes/finder-file-context/plan-brief.md` → decision table + out-of-scope list.
- Confirmed at plan-review (blast-radius check): triage answer to "Should the eval harness learn
  to exercise the tool loop in this change?" was ⭐ "Follow-up change".

**Hard data from phase 3** (full evidence: `context/changes/finder-file-context/verification.md`):

- glm-4.6: 0 tool calls in 4/4 runs, even after the prompt spelled out the cross-hunk dependency
  trigger class (`09e6e03`). Its findings on the planted flaw were shallow in-hunk observations.
- sonnet-5: called the tool (2 calls incl. a full read of the flaw file) and produced a major
  finding quoting the out-of-hunk module contract — the known-good tool-capable reference model.
- Cost: sonnet tool-loop run 64,993 in / 12,348 out / 77,341 total finder tokens ≈ 2.8× the
  feature-diff tool-less baseline (within the ~3× budget) and ≈ 4.1× the same-diff baseline
  (model-swap confound: sonnet's 12.3k output vs glm's ≤1.3k; probe ran a doubled 8-step budget).
- Package behaviors the evals will exercise, both born from phase 3: the strengthened tool
  instruction (`09e6e03`) and `prepareFinalStep` — tool-less final step so a fetch-happy model
  can't burn the whole budget and die with "No output generated" (`f4d6666`).

**Watch out** (from the #119 eval matrix): `review-result.schema.json` has
`additionalProperties: false` — the eval schema must track any `ReviewResult` field additions.
(Verified 2026-08-10: `finderTelemetry` lands on the PIPELINE result, pipeline.ts:272, not on the
finder's `reviewResultSchema` — so the finder-file-context branch does NOT break the eval gate;
stay alert if this change surfaces telemetry through the finder output instead.) qwen +
gpt-5.4-mini were excluded for deterministic pipeline incompatibilities, so the candidate matrix
starts from glm-4.6 + sonnet-5.
