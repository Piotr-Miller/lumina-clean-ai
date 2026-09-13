---
change_id: gauntlet-enhance-ui
title: Raise the enhance workspace against a competitor bar, via a Gauntlet Loop
status: implemented
created: 2026-08-25
updated: 2026-09-13
archived_at: null
issue: null
---

## Notes

**Authoring-time quality work, not a roadmap slice.** Nothing in `prd.md` is being
discharged here — the enhance workspace already ships and works. This change exists
because the `gauntlet-loop` skill has never been used for what it was built for, and
because §3, §4 and §5 of its release gate (`.claude/skills/gauntlet-loop/references/eval-matrix.md`)
can only be filled by a real run: blind staging with a live critic, a stop condition
actually honoured, and reference material handled without leaking into a public repo.

This run had two possible products. **Only one of them survives, by decision:**

1. ~~a measurably better enhance workspace~~ — **reverted**. The scope was the skill, not the product;
   the round-2 changes were undone and kept as a patch outside the repo
   (`scratchpad/gauntlet/enhance-ui/product-change.patch`). **That patch no longer exists**: a search of
   the home directory and `/tmp` on 2026-09-13 found no copy, so the reverted work cannot be restored
   from it. If it is ever wanted, rebuild it from the round-2 notes in the workbench.
2. **the live-loop evidence** that shows what the skill's release gate can and cannot deliver — which is
   why this folder exists at all.

That makes this change a **run record, not a product change**. Nothing under `src/` is modified by it.

The working record is `gauntlet/workbench.md` in this folder. Reference bytes never land
here. They lived in the gitignored `scratchpad/gauntlet/enhance-ui/reference/` and are
pinned by sha256 in the workbench, because this repository is public. As of 2026-09-13 that whole
directory is gone, including `capture.mjs`, so the workbench's pointers into it are history. The sha256
pins are now the only record of what was compared.

## Outcome (recorded 2026-09-13, at archive)

**The change met its purpose.** It existed to fill §3–§5 of the gauntlet-loop release gate from a real
run, and "Run 13" in `.claude/skills/gauntlet-loop/references/eval-matrix.md` records that:

- **§3 fails on 3.2.** A critic named our side with high confidence from the images alone. It
  recognised the product by its feature set, not by the wordmark.
- **§4 is partial.** 4.1, 4.2 and 4.5 pass. 4.3 and 4.4 were never exercised and are not counted as
  passed.
- **§5 is green.**

The same record says the pursuit of a green §3 was **deliberately abandoned** and that the skill stays a
draft on purpose. The three skill changes the run earned were batched and **not applied**: domain-A
blinding in `bars.md` §A and `critic-contract.md`, masking brand marks before staging, and verifying a
build by content. The workbench's "Assumptions the user has not confirmed" concern a product artifact
that was reverted, so they are moot.

The stop was the agreed three-round ceiling, honoured with the loop visibly unfinished. Round 3's named
gap is still open: we claim a before/after result on the entry screen that we never show. Pick it up in
a new change if the enhance UI is ever worked on for its own sake.
