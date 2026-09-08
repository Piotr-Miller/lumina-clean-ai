<!-- PLAN-REVIEW-DELTA -->

# Delta Review: managed set drops to five

- **Scope**: `dc16060`, `b182fb4` (Lumina) and `Piotr-Miller/ai-toolkit@762c2ed` — the propagation of
  the 2026-09-04 decision that `10x-impl-review-ci` is `consumer-owned`, not managed.
- **Not in scope**: the rest of the plan, unchanged since the 2026-09-03 review that graded it SOUND.
- **Date**: 2026-09-04
- **Verdict**: **SOUND** — the decision removes a latent conflict rather than creating one. Two
  documentation findings, both Phase 8 items, neither blocking Progress 1.2.

## What the delta had to get right

| Claim                                                  | Verified                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No stale "six managed" instruction survives            | ✓ — the only remaining "six" is the historical reference to plan review F3 in Phase 8 §3                                                                                             |
| Untrack set equals the managed claim set               | ✓ — five entries in `managed.json`, five trees in Phase 8 §2, `recovery.json` claims no tracked path                                                                                 |
| Allowlist arithmetic                                   | ✓ — `PUBLIC_SKILLS` holds 8 entries and 3 symbol hits, `.gitignore` re-includes 8 per tree in both trees, so "8 → 3 per tree" and "narrowed to three (3 hits)" are literally correct |
| The decision reaches every pointer, not just the prose | ✓ after `b182fb4`, which is where it had failed                                                                                                                                      |

`b182fb4` is the finding that mattered. `dc16060` corrected the plan's prose while leaving the
reference list instructing a future implementer to narrow all three allowlist places to two entries —
which would have untracked the very skill the decision keeps. Prose and pointers drifting apart is
the failure mode this plan already carries a lesson about; it recurred inside the fix for it.

## D1 — the decision closes a collision the plan was separately building a checker for

**Severity**: observation (favourable) · **Dimension**: Architectural Fitness

Phase 1 §5 pre-registers a seed delta whose logical content is a checker that "toolkit and 10x
manifests never claim the same target". Under the superseded classification that checker had a real
collision waiting for it: the 10x CLI manifest declares `10x-impl-review-ci` under lesson m5l3 with
its three files, the recovery channel restores that manifest verbatim, and a managed channel would
have claimed `.claude/skills/10x-impl-review-ci/**` as its own target. Two manifests, one path.

With the skill `consumer-owned` no toolkit channel claims it, and the collision is gone by
construction rather than by detection. The seed-delta checker keeps its value — it still guards the
class — but it no longer has a live instance to trip over on the first upgrade.

## D2 — "unresolved licence" is the wrong reason to reach the right decision

**Severity**: warning · **Dimension**: Plan Completeness · **Location**: `Phase 1 §3`,
`managed.json` `decisions_recorded`, research OQ #1

The delta justifies the move partly as course content "whose licence is unresolved". That is not
what the record says. `.gitignore:46-48` states that **m5l3 explicitly allowlists this one skill for
public repositories** — its public presence is a granted exception, not an unexamined exposure.

The decision is still correct, on a sharper reason: a grant to publish a skill _inside a repository_
is not a grant to _repackage it into a distributable artifact_. Those are different acts with
different audiences, and only the first one is licensed. Worth fixing precisely because a later
reader who checks the licence, finds it granted, and concludes the premise was false may "correct"
the classification back.

**Fix applied** in this pass: the reasoning in Phase 1 §3 and in `managed.json` now says the grant is
scoped to in-repository publication and does not extend to repackaging.

## D3 — the inaccurate "powers the public CI reviewer" claim lives in two files, and Phase 8 §3 names one

**Severity**: warning · **Dimension**: Blind Spots · **Location**: Phase 8 §3 bullet 2 vs
`.gitignore:46-48`

Phase 8 §3 corrects `AGENTS.md:110`'s claim that the skill "powers the public CI reviewer" —
`packages/code-reviewer/src/prompts.ts` is a hand-maintained transcription and no workflow reads the
skill tree at runtime. The identical phrasing sits in the `.gitignore` comment block, which the plan
touches for its re-include list but not for its prose, so the corrected claim would survive verbatim
one file away from its own correction.

The same comment also instructs the reader to keep the allowlist "in lockstep with PUBLIC_SKILLS ...
and in the mirror's sync.mjs — the three describe one set". After Phase 8 the mirror is cold and
read-only, so that third place stops being a live obligation and becomes a frozen artifact. Left
alone, the comment sends a future maintainer to update a repository the cutover deliberately retired.

**Fix applied** in this pass: Phase 8 §3 now names `.gitignore`'s comment block alongside
`AGENTS.md:110` and calls out the third-place wording.

## Effect on Progress

`1.2` — "Two-channel inventories account for every candidate path with exclusive ownership" — is
satisfied. Every candidate path resolves to exactly one channel, the two classifications that were
open when the inventories landed are now decided, and no path is claimed twice. D2 and D3 are
Phase 8 documentation corrections and do not touch classification.

`1.3` remains open: the three-way partition and overlay derivation (④) have not run.
`1.5` remains open by design.
