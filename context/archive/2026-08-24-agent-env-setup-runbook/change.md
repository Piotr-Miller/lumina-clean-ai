---
change_id: agent-env-setup-runbook
title: "Fresh-clone runbook for the agent tooling — make the skills re-sync reproducible on a new machine"
status: done
created: 2026-08-24
updated: 2026-08-24
---

## Decision on the open m5l3 question — resolved, detailed procedure SHIPPED

The plan left one call to the owner: does a keep-list / adapt-list count as
"quotes course-skill content"? **Resolved: it does not**, and the owner asked
explicitly for a detailed sync procedure, so §3 shipped in full.

The line is drawn by the repo's own words. `.gitignore:52-53` says the full
checker is local-only because _"it embeds course-skill content in its
adaptation allowlists"_ — the objection is to **quoted skill text**, not to the
mechanism. And the mechanism is already public: `AGENTS.md` names every skill
and states that the trees hold the "same skills; per-tool path/filename
references swapped".

So the runbook names **which** skills are adapted and **what** is swapped, and
quotes **no** skill body text and none of the checker's allowlists. Verified:
`grep -n "allowlist"` returns two hits, both explaining why `scripts/local/` is
unpublished — neither reproducing one.

## Verified against the trees, not recalled

The adapt-list was **measured**, because the source memory was 36 days old:
exactly 7 of 33 skills differ (`10x-agents-md`, `10x-e2e`, `10x-impl-review`,
`10x-infra-research`, `10x-roadmap`, `10x-rule-review`, `10x-stack-assess`);
the other 26 are byte-identical. §3.4 ships that as an executable check, so a
future re-sync is verified by re-running it rather than by trusting this note.
The known naive-find-replace regression greps clean (0 occurrences).

## One hazard found while implementing

`npm run format` (the plan's success criterion) reformats **150+ files
repo-wide**, including `context/archive/` — which is immutable — and rewrites
CRLF→LF in archived documents. It was reverted; only the three intended files
were kept. **Do not run repo-wide `npm run format` for a docs change**;
`lint-staged` already formats staged `*.{json,css,md}` on commit. Zero
`ground-truth/` files were touched, so no pinned hash moved — but that was
luck, and it is the same mechanism as the freeze violation guarded in PR #180.

## Notes

A developer cloning this repo onto a new laptop cannot currently reach a working
agent environment from anything written down. `README.md` §Getting Started ends
at `npm run dev` — correct for the **app**, silent about the **agent tooling**.
`AGENTS.md:111` names the obligation in five words ("re-sync the `.agents/skills`
copies") without saying what re-syncing means.

## The finding that shapes this change

An earlier reading of this gap proposed putting the detail in `scripts/local/`,
next to the checker that enforces it. **That does not survive the fresh-clone
requirement.** `scripts/local/` is gitignored (`.gitignore:55`), so on a fresh
clone it is _absent_ — a procedure stored only there is unreachable exactly when
it is first needed. Same for `.claude/skills/10x-*/`, `.claude/prompts/`, and
`.claude/.10x-cli-manifest.json`.

So the fresh-clone entry point **must be a tracked file**, and its job includes
naming the two restore sources for everything that is not in the clone:

| Absent after `git clone`                                                      | Restored by                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `.claude/skills/10x-*/`, `.claude/prompts/`, `.claude/.10x-cli-manifest.json` | `10x get <lesson>` (needs interactive `10x auth` first)    |
| `scripts/local/` (full checker + its config)                                  | the private mirror repo `10x-toolkit` (`sync.mjs` restore) |

The second row is the one nothing in the repo currently records.

## Constraints taken as given

- **`AGENTS.md` / `CLAUDE.md` stay lean** (owner's instruction). `AGENTS.md` is
  166 lines / 24 KB and loads into context every session; this procedure is
  needed rarely (after `10x get`, or once per machine). It gets a pointer, not
  the body.
- **Public-repo allowlist (m5l3)** still binds: the tracked file may describe
  the mechanism, but must not quote course-skill content.
- **`README.md` is not the home, but must be the signpost** — it is where a
  developer on a new laptop actually starts.

## Related

- `context/foundation/manual-setup-runbook.md` — the precedent this follows:
  ordered actions for configuration that "lives outside the codebase and that a
  fresh clone cannot reproduce", paired with `production-config.md` as the state
  record.
- `AGENTS.md:43` (checker split), `AGENTS.md:106-117` (10x-cli workflow),
  `.gitignore:42-55` (what is deliberately unpublished), `dcb8500` / PR #112
  (the change that created this shape).
