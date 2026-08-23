# Finder Truncation Note (R5) — Plan Brief

> Full plan: `context/changes/r5-finder-truncation-note/plan.md`
> Research base: `context/archive/2026-08-15-finder-fabrication-triggers/` (campaign archive)

## What & Why

When a PR diff exceeds 100 KB, the finder reviews a silently cut input and fabricates absence
claims about the files it cannot see (mechanism M1). The fabrication campaign proved this is
purely the cap's product: lifting the cap removed every M1 finding in 20 runs. The fix the
campaign deliberately did not ship is this change: tell the finder its input was truncated and
name exactly which files fell outside — then measure that M1 actually dies.

## Starting Point

The impl-reviewer already has this note (added after PR #143's three fabricated CRITICALs);
the finder never got it — its only truncation signal sits inside the fence the instructions
declare untrusted. The campaign left behind a validated measurement instrument (probe + grader +
frozen ground truth + recorded baseline: m1Runs 5/20, B=17) and a mandatory Venice fp4 provider
pin.

## Desired End State

Truncated finder reviews carry a trusted-position note (cut file + over-cap file list + "say
could-not-verify, never missing"); M1 findings read 0 across a fresh n=20 arm while M2+M3 and
finding volume hold their baseline bands; untruncated reviews are byte-identical to today's.

## Key Decisions Made

| Decision          | Choice                                            | Why (1 sentence)                                                       | Source   |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Mechanism target  | M1 via a truncation note                          | R1's ELIMINATED read proved M1 is cap-manufactured                     | Research |
| Note content      | Sentence + over-cap file list + cut file          | Named invisibility attacks M1 at its root; functions already exist     | Plan     |
| Note position     | Above the fence, mirroring impl-review's note     | In-band marker is inside declared-untrusted data; precedent validated  | Research |
| Measurement       | n=20 CI-base vs archived baseline                 | Matched denominators — the campaign's read-off bands apply directly    | Plan     |
| Success bar       | M1 findings 0/20, guards hold                     | Matches the campaign's strongest read; falsifier is its exact negation | Plan     |
| Down-side guard   | M2+M3 within \|c−17\| ≤ 3; findings/run 8.3 ± 50% | Catches a muzzled finder                                               | Plan     |
| Up-side guard     | `m1_to_m3_rewrites = 0` hard guard; M3 band < 58  | A recorded label with no threshold decides nothing                     | Review   |
| Filename handling | Static note + fenced JSON `<truncation-metadata>` | Character stripping can't stop natural-language injection              | Review   |
| Tool interplay    | Tool-neutral note + fetch-first tool-branch line  | The note must not short-circuit `getFileContext` retrieval             | Review   |
| Claim scope       | Prompt-effect only; tool-enabled unmeasured       | Paid arm is tool-less; production can fetch over-cap files             | Review   |
| Live verification | Passive check on next >100 KB PR                  | Records note firing, tool calls, and rewrite check; no synthetic PR    | Plan     |

## Scope

**In scope:** finder prompt note; `ReviewUnit` truncation fields; window-computation port into
`src/pipeline.ts`; probe/grader re-point; pre-registered n=20 measurement; decision record.

**Out of scope:** judge/impl-review changes; capDiff path-order bias; R2 re-run; fixture
building; any model/provider change; live probe PR.

## Architecture / Approach

`capDiff` already returns `truncated`; a new `truncationReport` (ported from the campaign probe)
adds `cutFile` + `overCapFiles`. Both flow through optional `ReviewUnit` fields into
`buildPrompt`, which renders a STATIC note above the untrusted fence while the filenames — PR
content, injectable as natural language — go JSON-encoded inside a dedicated
`<truncation-metadata>` fence declared untrusted (list capped at 20). The probe passes the same
fields and its provenance binds the intervention (`promptSha256` + derived `noteActive`), so
measurement provably exercises the same prompt-building path under a tool-less configuration
(the tool-enabled interaction stays unmeasured — scoped accordingly); the note lives outside
the fenced diff, so the archived frozen ground truth and `inputSha256` stay valid for grading.

## Phases at a Glance

| Phase                  | What it delivers                                        | Key risk                                             |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| 1. Note + library port | Production note wired end-to-end; instrument re-pointed | Anchor drift (sent bytes must not change)            |
| 2. Pre-registration    | Bars frozen before spend                                | —                                                    |
| 3. Measurement (paid)  | n=20 graded arm vs baseline                             | Falsifier fires (note has no effect); ~$5.50 ceiling |
| 4. Close-out           | Decision record + passive live check registered         | Guard trips (over-suppression)                       |

**Prerequisites:** `OPENROUTER_API_KEY`; Venice fp4 still serving glm-4.6 with structured outputs.
**Estimated effort:** ~2 sessions; ≤ $5.50 paid.

## Open Risks & Assumptions

- Venice fp4 endpoint availability/behavior may have drifted since the campaign — the first paid
  run doubles as a serving-side check.
- Grader nondeterminism exists (one recorded disagreement in the campaign); the hand-read
  protocol is the control.
- The note might shift claims from M1 into new M3-shaped speculation — the finding-level
  M3 band plus the hand-read migration label exist precisely for this (the run-level band
  alone cannot see it).
- The paid arm is tool-less; the tool-enabled production interaction stays unmeasured until
  the passive live check — decision claims are scoped accordingly.

## Success Criteria (Summary)

- M1 findings 0 across 20 gradeable runs (falsifier: ≈5/20 unchanged).
- Down-side: M2+M3 runs within |count − 17| ≤ 3, mean findings/run in [4.15, 12.45];
  up-side: `m1_to_m3_rewrites = 0` (hard guard, frozen label definition) and total M3 findings
  under a Phase 2-derived bound that rejects full migration (< 58).
- Untruncated prompts byte-identical; dry anchors reproduce the archived inputSha256;
  provenance shows a constant promptSha256 with noteActive derived, not asserted.
