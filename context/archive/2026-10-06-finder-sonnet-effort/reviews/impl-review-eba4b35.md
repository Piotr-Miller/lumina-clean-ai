<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: finder-sonnet-effort — sonnet-5 as the finder at reasoning effort low and medium

- **Plan**: context/changes/finder-sonnet-effort/plan.md
- **Scope**: full (Phases 1–4 have implementation evidence; Phase 5 did not run, by the plan's rule on a NOT ADMITTED verdict)
- **Base**: 9c73c034019cd4c5f17c60173acfe2f546979dfb (merge-base)
- **Head**: eba4b35c491a15c8e19e92750c86986364169b90
- **Worktree**: excluded — context/changes/cloud-exif-orientation/change.md (unrelated, untracked)
- **Checks ran at**: eba4b35c491a15c8e19e92750c86986364169b90 (current HEAD)
- **Manual acceptance**: 6 of 7 confirmed — pending: 4.4 (owner classified every row); Phase 5 manual rows not applicable
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION (at review time; all four findings fixed in triage, 2026-10-09)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — The verdict label omits hand-read #247, but the sealed rule makes it a failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-sonnet-effort/gate.md:176-177, gate.md § Verdict (label and gate table), change.md
- **Detail**: The sealed rule (§ Pre-registration §4) reads "the owner classifies **every** published finding. Zero rejected, and unresolved = rejected". The owner did not adopt the delegated classifications, so no #247 finding has an owner classification. Every #247 run has 3–6 published findings, so under that rule each one is unresolved, which counts as rejected. Hand-read #247 is therefore a FAIL for both arms by rule, not "not established". §10 requires the label to list every established failed gate, so it should be `NOT ADMITTED (low: hand-read #247, hand-read #269; medium: hand-read #247, hand-read #269)`. The recorded label, chosen by the owner on this session's recommendation, lists only #269. The overall outcome does not change. Two related things go wrong as well:
  - `gate.md` § Delegated blind classification ("The delegated results fail hand-read #247 for both arms") reads against § Verdict ("not established").
  - Step 4.4 is left `[ ]` with nothing recording that it can no longer be completed blind, because the key was revealed.
- **Fix A ⭐ Recommended**: The owner re-records the label. Hand-read #247 becomes FAIL by "unresolved = rejected", with no owner classification. The delegated classifications stay as information.
  - Update § Verdict (label and gate table), `change.md` and the § Delegated wording.
  - Record in § Verdict that 4.4 cannot be completed blind now that the key is revealed.
  - Strength: Applies the sealed rule mechanically, with no new judgement, and removes the contradiction between sections.
  - Tradeoff: Changes a label the owner already recorded (4.5), so the owner must re-confirm it.
  - Confidence: HIGH — the rule text is unambiguous, and §10 requires every established failed gate in the label.
  - Blind spot: None significant.
- **Fix B**: Keep the label, and record in § Verdict why "unresolved = rejected" is taken not to apply to rows that were never put to the owner.
  - Strength: No change to the owner's recorded decision.
  - Tradeoff: It is an interpretation added after the seal, and the sealed text gives it no support.
  - Confidence: LOW — "unresolved" plainly covers findings nobody resolved.
  - Blind spot: How a later reviewer or a successor plan reads the deviation.
- **Decision**: FIXED via Fix A (2026-10-09) — owner re-recorded the label as `NOT ADMITTED (low: hand-read #247, hand-read #269; medium: hand-read #247, hand-read #269)`; gate.md § Verdict (label, gate table, #247 bullet with 4.4 disposition) and § Delegated wording, hand-read-247.md owner decision, change.md updated. Seal hash unchanged.

### F2 — The finder's Anthropic pin silently re-routes every other `createReviewer` caller

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: packages/code-reviewer/src/reviewer.ts:218, packages/code-reviewer/evals/finder-provider.ts:185-204
- **Detail**: `provider: options.providerRouting ?? resolveFinderProviderRouting()` makes `only: ["anthropic"], allow_fallbacks: false` the default for every caller that passes no routing. At the base, `reviewer.ts:158` sent routing only when one was resolved. The promptfoo provider (`evals/finder-provider.ts:185`) passes none, so its non-Anthropic rows (`z-ai/glm-*`, `deepseek/*`, `evals/promptfooconfig.yaml:30-63`) can only be sent to Anthropic. They become provider-error rows, not measurements. The default model change also moves `scripts/finder-distribution.mjs` and `src/demo.ts` to sonnet-5. The code came from the predecessor's port (`33fdb79`); neither plan nor the Phase 1 review mentions the evals. It is dark and unmerged, because the verdict is NOT ADMITTED, so it matters only if a successor reuses this code, as this change reused its predecessor's.
- **Fix A ⭐ Recommended**: Record it as a carry-forward item for any successor that reuses this branch's code. Change no code here.
  - Strength: The branch will not merge, and post-seal code edits on a dead branch would change nothing measured.
  - Tradeoff: The defect stays in the branch until someone reuses it.
  - Confidence: HIGH — the plan merges `packages/code-reviewer` only on ADMITTED.
  - Blind spot: Whether a successor reads the carry-forward note.
- **Fix B**: Patch it now: `evals/finder-provider.ts` passes its own routing, or the pin moves to the CLI/pipeline path, and the yaml's baseline comment is updated.
  - Strength: The branch becomes safe to reuse as-is.
  - Tradeoff: Code edits after the measurement, with no gate to verify them. Moving the pin also changes a sealed file (`src/reviewer.ts`).
  - Confidence: MED — straightforward, but out of this plan's scope.
  - Blind spot: Other `createReviewer` callers not inspected.
- **Decision**: FIXED via Fix A (2026-10-09) — carry-forward note in gate.md § Carry-forward for any reuse of this branch's code; no code change.

### F3 — Delegated Phase 4 steps lack owner approval and proof of blindness

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-sonnet-effort/hand-read-247.md (R247-13 / R247-13-PNG), plan.md Progress 4.3
- **Detail**: The owner approved a 25-row dedup. The delegated session then split R247-13 into 26 rows without re-approval, yet 4.3 reads "Owner approved dedup". The split moved the one `medium` member out of an otherwise all-`low` rejected row. No run result changed: `medium-247-r1` still fails on R247-03. The claim that classification came before opening the key proves blindness only if that session never saw the arm mapping. No file records whether it did. All four Phase 4 files first appear together in `30c9ae7`. The effect is limited, since #247 carries no owner classification either way (F1).
- **Fix**: Add one line to `gate.md` § Delegated blind classification: the split was made after the owner's dedup approval and not re-approved, and the classifying session's blindness rests on its own statement.
- **Decision**: FIXED (2026-10-09) — disclosure added to gate.md § Delegated blind classification and joined results ("Limits of this record").

### F4 — Runner gaps for any reuse: the auth regex matches token counts; spawn errors are unhandled

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/sonnet-gate.mjs:360-361, :379; :911-933; :180-185
- **Detail**: Three gaps, none of which affected the recorded series:
  - `MEASUREMENT_ERROR` (`/\b(401|402)\b|…/`) is tested against the child's whole stderr, before any success check. That stderr includes step lines with bare token counts, `getFileContext` paths and rejected model text. Reproduced: exit 0, a complete review, and a step with `out=401` → `measurement-error`. It fails safe (the series stops for the owner), and none of the 8 runs was affected.
  - `spawnReviewCli` has no `'error'` listener. If the spawn itself fails, the runner crashes after appending `started`, and the run blocks the series with nothing spent.
  - A torn JSONL line throws a raw `SyntaxError` instead of a refusal.
  - Also: each committed record's `artifacts` field holds an absolute `/home/<user>/…` path, and the default run directory without `--artifacts` lies inside the tracked change folder.
- **Fix**: List these in the same carry-forward note as F2. The series is complete and the sealed runner is not re-run.
- **Decision**: FIXED (2026-10-09) — listed in gate.md § Carry-forward for any reuse of this branch's code; sealed runner not changed.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-sonnet-effort/ (change.md, plan.md, plan-brief.md, gate.md, gate-manifest.json, gate-effort-runs.jsonl, hand-read-247.md, hand-read-269.md, hand-read-key.json, reviews/\*)
- **Automated checks (all PASS):**
  - Phase 1:
    - `npm test` 734/734, `npm run typecheck` and `npm run lint` in `packages/code-reviewer`; root `npm run format:check`;
    - `false &&` at `review.yml:29`;
    - `describe --arm low|medium` differ only in `resolved.finder.reasoningEffort`, and `describe` with and without `--arm` equals manifest `global` / `arms` exactly.
  - Phase 2:
    - all six frozen inputs reproduce their sha256; both worktrees are clean at their heads;
    - the seal hash `9639b955…a2c33` reproduces at HEAD; the six code hashes and the `src` tree `bb21da67…` match;
    - `git ls-remote` shows `finder-sonnet-effort/seal` peeled to `794cfbe`.
  - Phase 3:
    - 8 started events and 8 records, in sealed `runOrder`;
    - every start had T + P + reserve ≤ $4.00 (max $1.813180);
    - max counter $54.560493 ≤ ceiling $57.374463;
    - every step has a reasoning count.
  - Phase 4:
    - 32 findings, each in exactly one of 26 rows, and the hand-read headings equal the key;
    - projections recompute: `low` $6.628083, `medium` $9.374182.
- **Independent passes.** A plan-drift pass found every Phase 1 item MATCH, with nothing on the NOT-doing list breached. It found no edit to the sealed section after `794cfbe`, and the manifest and runs file byte-unchanged since `0d17e81`. All 26 rows' variant text equals the keyed findings, and the per-run tables recompute. A safety pass found no credential, header or prompt content in any log, record or request projection, and no shell interpolation of untrusted input in `action.yml`. The dark default sends no `reasoning` field, and no other workflow invokes the reviewer.
- **Self-review caution.** This session wrote the Phase 4 pool, rows, pre-sort, projections and verdict and recommended the label F1 questions. The Phase 4 verification was therefore delegated to an independent pass, which raised F1.
- **Lessons:** 35 of 38 entries applied (`impl-review` in Applies to). The ones that bore on this review: "Writing a fact into its canonical home leaves every pointer to it stale" (the § Delegated wording, F1) and "A check that cannot say what it found…" (F4).
- **Mutation check skipped:** no risk in `context/foundation/test-plan.md` maps to `packages/code-reviewer`.
- **Scratch verification scripts** (the 4.1 coverage check and the 4.2 projection) live outside the repository; gate.md states what they check.

## Triage (2026-10-09)

- **Fixed:** F1 (Fix A — label re-recorded by the owner), F2 (Fix A — carry-forward note), F3 (disclosure), F4
  (carry-forward note). Nothing skipped or accepted.
- No code changed. Edits: gate.md, hand-read-247.md, change.md and this report; the sealed Pre-registration
  hash `9639b955…a2c33` is unchanged.
