# Decision — deconfounded irregular re-run

- **Change**: `fixture-irregular-rerun`
- **Date**: 2026-08-24
- **Outcome**: **H-naming SURVIVES** (1/20, band ≤ 5). Removing the real
  compile error did not restore fabrication — it fell further, 2 → 1.
- **Also**: **NOT REPRESENTATIVE** by the widest margin of any arm (|1 − 17|).
- **Scope**: `z-ai/glm-4.6` on Venice fp4, tool-less, pre-note prompt.
- **Spend**: $2.12 of an $8 stop. Pre-registration at `785f540`, before the
  first paid call. Freeze verified held.

## What this settles

The archived irregular arm read 2/20 with a real compile error in its fixture,
so it could not distinguish two explanations. This run removes the bug and
changes nothing else — placement is byte-for-byte the same window, same cut
file, same over-cap set.

- **H-bugs is REJECTED.** If the model's low fabrication had been because it
  had genuine defects to report, removing them would have pushed fabrication
  back up toward the base fixture's 11/20. It did the opposite.
- **H-naming SURVIVES.** With the enumerable filename sequence gone, invented
  paths stay at 0 (0 of 230 findings) and fabrication sits at 1/20.

So the archived arm's substantive conclusion holds, and is now supported by a
run whose freeze actually held.

## The consolidated picture across four arms

| Input                                | Pipeline    | fabricationRuns |
| ------------------------------------ | ----------- | --------------- |
| real PR #127 diff (CI baseline)      | base        | **17/20**       |
| fixture, uniform names               | base        | 11/20           |
| fixture, uniform names               | `--ordered` | 7/20            |
| fixture, irregular names (+ bug)     | base        | 2/20            |
| **fixture, irregular names (clean)** | base        | **1/20**        |

Read together: **a synthetic fixture barely fabricates at all once its own
naming artifact is removed** — 1/20 against a real diff's 17/20. The 11/20 that
once looked like a near-miss was substantially the artifact, not the content.

That is the programme's central negative, and it is now established twice, the
second time under a valid freeze.

## Freeze violation found in the archived arm (recorded, not swept)

While setting this run up I found the archived irregular arm pinned its ground
truth at `f423d87f…` while its grader recorded `b6bddc46…`: the pre-commit
prettier hook reformatted the scripted-generated markdown **after** the hash was
taken. Under that pre-registration's own rule the archived 2/20 is formally
**invalid**.

- The other arms were checked and are **clean** — base fixture (`122bc3ea`)
  and the ordered arm (`1edca060`) both have pinned = grader-read. **The DROP
  result for PR #164 is unaffected.**
- The reformatting was whitespace only, so the archived number was probably
  sound — and this run confirms it was, landing at 1/20 next to its 2/20. But
  it was confirmed, not assumed.
- **Mitigation, now standard for this instrument:** run prettier over the
  ground truth _before_ hashing, and verify the hash is stable across a second
  pass. Done here, and re-verified after committing.

## Disposition

**1. Stop trying to make a synthetic fixture representative.** Four arms have
now moved it 11 → 7 → 2 → 1, always away from 17. The composition knobs tried
(prose weight, naming regularity, cap pipeline) all reduce fabrication. The
open question is no longer "which knob" but whether generated content can
reproduce real-diff fabrication at all — and nothing here suggests it can.

**2. The fixture keeps a narrower, real use.** M1 and M3 both reproduce
mechanically and its placement is verified under both cap pipelines, so it is
usable to test _whether an intervention removes a mechanism_. It must not be
used to estimate rates or transfer effect sizes.

**3. Manipulation checks must test the claim, not a keyword.** The loose
duplicate-check returned 34 false positives and would have invalidated a sound
run; the strict one returned 0. Check the artifact directly where possible.

**4. No further paid fixture arms without a new hypothesis.** Another
composition tweak would be a fifth data point on the same curve.

## Non-claims

- No claim that synthetic fixtures are impossible — one generator lineage, one
  model, one provider.
- No claim about _why_ real diffs fabricate more; that mechanism is unidentified
  and is the interesting open question.
- Nothing revises the CI baseline (17/20), the base fixture (11/20), or the
  ordered DROP (7/20) — all measured, all with freezes that held.
