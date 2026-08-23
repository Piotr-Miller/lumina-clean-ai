# Decision — Finder Truncation Note (R5)

- **Change**: `r5-finder-truncation-note`
- **Date**: 2026-08-23
- **Outcome**: **Success bar NOT MET; falsifier read UNCHANGED — the intended effect is
  falsified; PRIMARY up-side guard TRIPPED.** All read off the frozen bars
  (`verification.md`, pre-registered at `078a1e8` + pre-spend amendments `60f5e32`, both
  before the first paid call), no renegotiation.
- **Scope of every claim below** (pre-registered, plan-review F3): the **tool-less
  single-attempt prompt effect** of the truncation note on `z-ai/glm-4.6` served by Venice
  fp4 (Amendment A1 pin). Production runs tool-ENABLED with a diff-scoped `getFileContext`
  able to fetch over-cap files — **that interaction is unmeasured until the passive live
  check registered below**, and nothing here generalizes to it, to other providers, or to
  multi-attempt loops.

## What was measured

One arm: CI-base n=20 under the production truncation note (the exact prompt path shipped
in Phase 1: `noteActive: true` on all 20 runs, constant `promptSha256`
`e802502ca97f8e5659fbb4c90ef121fda11beb7fab8a033eb9010af60228ad7f`), graded against the
byte-identical frozen ground truth (sha256
`12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820`, verified pre- and
post-grade). The manifest `inputSha256` equals the archived CI-base value — the note
changed the prompt only, never the graded input. Hand-read: 83 adjudications (73 flagged +
10 deterministic clean controls), 5 misgrades, **6.02%** — under the 15% invalidity bar,
grading valid. Ledger: 20/28 attempts, **$2.83** of the $5.50 ceiling.

| Bar               | Frozen condition                    | Read-off                     | Result                    |
| ----------------- | ----------------------------------- | ---------------------------- | ------------------------- |
| Success bar       | M1 findings = 0 across 20 gradeable | M1 findings **10**           | **NOT MET**               |
| Falsifier (A4)    | m1Runs ∈ [2, 8] → UNCHANGED         | m1Runs **5**                 | **UNCHANGED — falsified** |
| Down-side band 1  | fabrication runs (M2+M3) ∈ [14, 20] | **18/20**                    | held                      |
| Down-side band 2  | mean findings/run ∈ [4.15, 12.45]   | **9.05**                     | held                      |
| Up-side PRIMARY   | `m1_to_m3_rewrites` = 0             | **1** (H-69, hand-confirmed) | **TRIPPED**               |
| Up-side SECONDARY | total M3 ≤ 57                       | **54**                       | no trip                   |

Reference baseline (archived campaign, same instrument, same ground truth, no note):
fabrication 17/20, m1Runs 5/20, findings 166 — M1 10, M2 6, M3 48, mean 8.3. Note arm:
fabrication 18/20, m1Runs 5/20, findings 181 — M1 10, M2 9, M3 54, mean 9.05.

## The findings, traceable to the read-offs

1. **Telling the model its input was cut does not remove the absence claims — the
   falsifier held exactly.** m1Runs **5/20** and M1 findings **10** are numerically
   identical to the no-note baseline. A trusted-position note stating the diff was
   truncated, naming the over-cap files, and instructing "could not verify" left the M1
   mechanism untouched in single-attempt tool-less draws. The campaign's R1 read
   (ELIMINATED — lifting the cap removes every M1) does **not** extend to disclosure:
   removing the blindness works; describing the blindness, in this channel, does nothing.
2. **The note can relabel a fabricated absence instead of removing it.** One
   hand-confirmed `m1_to_m3` rewrite (H-69: "no visible tests" for a wholly over-cap
   schema test file, graded M3) matches the frozen rewrite definition — the archived M1
   claim shape, landing as M3 only because the note disclosed the absence. Per the frozen
   meaning this trips the PRIMARY guard and is decision-bearing exactly like the failed
   success bar. The hand-read additionally judged H-69's true mechanism to be M1 (one of
   the 5 recorded misgrades); under either label the outcome is unchanged — as M3 it is
   the hand-confirmed rewrite, as M1 it is an eleventh finding on a bar that requires
   zero.
3. **No muzzle, no drift.** Both down-side bands held (fabrication 18/20 against
   |count − 17| ≤ 3; mean 9.05 findings/run inside [4.15, 12.45]) and the SECONDARY guard
   did not trip (M3 total 54 ≤ 57). The note neither suppressed finding volume nor moved
   the non-M1 mechanisms outside their frozen bands.
4. **Instrument identity held throughout.** Dry anchors reproduced the archived values
   (rawBytes 215,560 / sentBytes 100,030), `inputSha256` matched the archived manifest,
   ground-truth hashes verified before and after grading, provider Venice on every run,
   zero finder errors, zero failed grader calls.

## Disposition

**1. The note stays in production — on strictly limited grounds, with its prompt-only
justification recorded as falsified.** The recorded bars license no benefit claim: in the
measured channel the note did not move M1 at all, and the primary guard trip stands
against it. What the bars do establish is the absence of measured harm — both down-side
bands held, the secondary guard did not trip, untruncated prompts are byte-identical by
pinned test, and the note adds ≤ ~1 KB to truncated prompts. The note's **sole remaining
justification** is the tool-enabled production interaction the pinned tool-less instrument
structurally could not measure: in production the note's `<truncation-metadata>` block is
paired with `buildInstructions`' fetch-first sentence and a diff-scoped `getFileContext`
that can fetch over-cap files (they are inside the diff's path allowlist). That channel is
unmeasured — this decision states that outright and claims nothing about it. If the
passive live check below shows the tool-enabled channel inert too (note fires, no
metadata-targeted fetches, or a finding matching the frozen rewrite definition), the
remaining justification is gone and the note reverts as its own change.

**2. Passive live check — registered concretely (re-review F2).** On the next naturally
oversized PR review (raw diff > 100 KB in `review.yml`'s finder, tool-enabled production
path — no probe PR is created for this), record from the Actions run log and the
`ai-review-output` artifact (`review.json` + per-step finder telemetry):

- (a) that the note fired — the run's truncation banner plus the rendered
  `<truncation-metadata>` block in the finder prompt path;
- (b) every `getFileContext` call, and for each whether its target was a
  metadata-named file (the cut file or an over-cap file);
- (c) whether any finding matches the frozen M1-rewrite definition, quoted verbatim from
  `verification.md`: "an absence/missing/not-provided claim about a file the truncation
  metadata names, or any over-cap file — the archived M1 claim shape, landing as M3 only
  because the note disclosed the absence".

The check is registered in `change.md` Notes; its outcome decides keep-vs-revert per
Disposition #1.

**3. Still-open follow-ups, restated without adoption** (both named in the archived
campaign's decision.md; neither is owned by this change):

- **capDiff path-order bias** (archived Disposition #4): byte order selects which files
  fall over the cap — and now also selects which files the note names as invisible.
- **R2 re-run** (archived sensitivity note): the R2 UNCHANGED verdict remains one
  adjudicated finding away from an n=20 retest it never received.

## What this change does not claim

- **Not that the note is useless in production.** The tool-less pin was the instrument's
  requirement, not production's shape; the tool-enabled interaction is unmeasured until
  the passive live check, in both directions.
- **Not that the note works anywhere.** No measured channel showed benefit; the keep in
  Disposition #1 rests on absence of measured harm plus an unmeasured channel with a
  registered observation point — it is not a benefit claim.
- **Not a rewrite rate.** One hand-confirmed rewrite in 181 findings establishes
  existence, not a rate — the guard was existence-shaped (= 0 vs ≥ 1) by design.
- **Not that disclosure fails beyond the pin.** glm-4.6 on Venice fp4, single-attempt,
  tool-less; the campaign already showed serving-side behavior is a first-order variable.
- **Not that the grader is ground truth.** 6.02% hand-read misgrade rate; the counts
  carry hand-read-validated grading, nothing stronger — H-69's own mechanism label was
  among the misgrades, and the read-offs stand on the frozen validation-only protocol
  (Amendment A1's outcome-sensitive branch did not fire: recorded M1 was 10, not 0).
