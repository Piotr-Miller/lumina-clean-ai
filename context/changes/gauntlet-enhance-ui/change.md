---
change_id: gauntlet-enhance-ui
title: Raise the enhance workspace against a competitor bar, via a Gauntlet Loop
status: new
created: 2026-08-25
updated: 2026-08-25
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
   the round-2 changes were undone and kept as `scratchpad/gauntlet/enhance-ui/product-change.patch`,
   outside the repo. Restore with `git apply` if that work is ever wanted on its own terms.
2. **the live-loop evidence** that shows what the skill's release gate can and cannot deliver — which is
   why this folder exists at all.

That makes this change a **run record, not a product change**. Nothing under `src/` is modified by it.

The working record is `gauntlet/workbench.md` in this folder. Reference bytes never land
here — they live in the gitignored `scratchpad/gauntlet/enhance-ui/reference/` and are
pinned by sha256 in the workbench, because this repository is public.
