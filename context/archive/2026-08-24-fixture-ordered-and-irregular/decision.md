# Decision — ordered + irregular fixture arms

- **Change**: `fixture-ordered-and-irregular`
- **Date**: 2026-08-24
- **Outcomes**: Arm A **DROP** (7/20 vs the fixture's own 11/20, by one run).
  Arm B **NOT REPRESENTATIVE** (2/20) — its registered mechanism prediction
  held, but its rate result is confounded by a defect in my own generator.
- **Scope**: `z-ai/glm-4.6` on Venice fp4, tool-less, pre-note prompt.
- **Spend**: $3.44 of a $15 stop. Pre-registration committed at `0e5818a`,
  before the first paid call.

## Arm A — the first MEASURED evidence that PR #164 reduces fabrication

Until now, the claim "source-first ordering suppresses cap-manufactured
absence claims" rested entirely on construction: on the real diff, ordering
moves the canonical M1 target inside the window, so the claim can no longer be
true. That is an argument, not a measurement.

Arm A ran **byte-identical fixture bytes** (sha256 `26437218…`, verified equal
to the archived arm's input) through the two cap pipelines. Fabrication fell
**11/20 → 7/20**, a DROP under the frozen bands.

**Three caveats that must travel with this number:**

1. **The margin is one run.** 7 is exactly the DROP threshold. One more
   fabricating run reads UNCHANGED. Treat this as "consistent with a real
   reduction", not "a reduction of size X".
2. **The predicted mechanism did not appear.** I registered that ordering would
   create a _new_ M1 flavour — absence claims about the newly over-cap prose.
   Zero M1 findings cite prose. So the drop is not explained by the story I
   expected; M1 simply became rarer (5 → 2) without prose-absence replacing it.
3. **A second effect is entangled.** Arm A produced **zero invented-path
   findings** on the same uniformly-named content that generated eight of them
   in the base arm. The base arm's cut hid six fillers; arm A's hid one. So the
   invented-path mode plausibly tracks _how much is hidden_, not just naming —
   and part of arm A's drop may be that mode disappearing rather than genuine
   fabrication falling.

Caveat 3 matters beyond this arm: it is an alternative explanation for the
headline, and it was not predicted.

## Arm B — the naming hypothesis is falsified in the informative direction

The base fixture's decision named one suspect for its 11/20: the enumerable
`d-filler-01..08` sequence that produced 8 invented-path findings. Arm B
removed the sequence and nothing else.

- **Mechanism prediction HELD, cleanly:** invented-path findings = 0 across
  **all 149** findings.
- **Rate went the wrong way:** 2/20, further from B = 17 than the 11/20 it was
  meant to improve.

The pre-registered fallback reading applies, and sharpens: those invented-path
findings were themselves graded M3, so they were **inflating** the base arm's
number. The base fixture never fabricated at 11/20 on its merits — a quarter of
its flagged findings were an artifact of its own filenames. **The honest
estimate of a synthetic fixture's fabrication rate is closer to 2/20 than
11/20**, against a real diff's 17/20.

That is the substantive finding of this change, and it is bad news for the
fixture programme: generated content appears to be far less fabrication-inducing
than a real diff, and the base arm's near-miss was flattering noise.

## ⚠️ Instrument defect I introduced (limits arm B)

`queue-drain.ts` in `fixture-irregular.diff` declares `const batchDefaults`
**16 times in one file** — a genuine compile error, emitted by my
`irregularBody` generator repeating its const-declaring variant. Two hand-read
controls correctly reported it as a true defect.

So arm B's rate has two explanations it cannot separate:

1. removing the enumerable naming removed the invented-path mode; or
2. the fixture accidentally contained real, glaring bugs, so the model reported
   truths instead of inventing.

The **mechanism** result (0 invented paths) is unaffected — that is about which
paths were cited, not how many findings there were. The **rate** result is
confounded and must not be quoted as "irregular naming reduces fabrication to
2/20".

## Disposition

**1. PR #164 keeps its justification, now with evidence — stated at its true
strength.** "Measured DROP on a fixture, by a one-run margin, with an entangled
alternative explanation" is what we have. Not "ordering cuts fabrication by
36%".

**2. Fix the generator before any further fixture work.** The duplicate-const
bug is a one-line fix (emit the const once per file, not per body). Every arm
run on `fixture-irregular.diff` before that fix is confounded.

**3. Do not iterate the fixture toward 14–20.** Two arms have now moved it
_away_ from the baseline (11 → 2). Continuing to tune composition until the
number lands in the band would be fitting the artifact to the bar. The next
useful question is not "how do I make the fixture fabricate more" but "is
synthetic content capable of it at all" — which needs a different design, not
another tweak.

**4. Registered follow-up, cheap and well-posed:** re-run arm B on a fixed
generator (no duplicate consts) to separate the two explanations. If the rate
stays ~2/20 with real bugs removed, explanation 1 survives; if it climbs back
toward 11/20, the confound was doing the work.

## Non-claims

- No claim about the _size_ of the ordering effect — the margin forbids it.
- No claim that irregular naming reduces fabrication; that arm is confounded.
- No claim that synthetic fixtures cannot work — two compositions, one model,
  one provider scope.
- Nothing here revises the archived campaign's B = 17 or the base fixture's
  11/20 as measured; both stand, with the base arm's composition now understood
  to include an artifact.
