# Fresh-Clone Agent Environment Runbook — Implementation Plan

## Overview

Write down, once, how a developer gets from `git clone` to a working agent
environment on a new machine — and make the two lean rule files point at it
instead of half-describing it.

This is a documentation change. No application code, no CI, no skill content.

## Current State Analysis

Four facts, each verified against the repo:

1. **`README.md` §Getting Started** (lines 28–58) is a five-step app setup that
   ends at `npm run dev`. It never mentions skills, `10x get`, or the two skill
   trees. A developer following it lands on a machine where `/10x-*` commands do
   not exist and does not learn why.
2. **`AGENTS.md:111`** says only "after a re-fetch, re-sync the `.agents/skills`
   copies and run `npm run check:skills`". What _re-sync_ means — which files
   are copied verbatim, which are adapted, and how — is written nowhere.
3. **`scripts/local/` is gitignored** (`.gitignore:55`) and therefore **absent on
   a fresh clone**. It currently holds `check-skills-sync.ts`,
   `lib/skills-sync-checker.ts`, `lib/skills-sync-config.ts`,
   `skills-sync-checker.test.ts`. `AGENTS.md:43` instructs the reader to run it
   — on a fresh clone that instruction cannot be followed, and nothing says how
   to obtain the directory.
4. **`context/foundation/manual-setup-runbook.md` already solves this shape** for
   external services, and states the pattern in its own header: ordered actions
   for configuration that "lives outside the codebase and that a fresh clone
   cannot reproduce", split from `production-config.md` as the state record.

### Key discoveries

- The gitignored-restore problem is the whole reason this change is not just
  "add a paragraph to AGENTS.md". Two distinct restore sources must be named
  (`10x get` for course artifacts; the private `10x-toolkit` mirror for
  `scripts/local/`), and only one of them is currently written down anywhere.
- `npm run check:skills` already prints the correct next step when it detects a
  course environment: `(local course environment detected — run the full checker
too: npx tsx scripts/local/check-skills-sync.ts)`. The runbook should lean on
  that signal rather than duplicate it — but note it is emitted _after_ a green
  public check, so it does not help someone who has no `scripts/local/` at all.
- `10x auth` is an interactive magic-link flow (`AGENTS.md:116`), so the runbook
  must mark it as a human step that cannot be scripted or run by an agent.

## Desired End State

A developer with a fresh clone and no prior context can:

- reach a working agent environment by following one linked document;
- know which artifacts are deliberately absent from the clone, and which of the
  two sources restores each;
- verify the result with a command that either passes or names what drifted.

`AGENTS.md` and `CLAUDE.md` grow by at most one line each.

## What We're NOT Doing

- **Not** moving the procedure body into `AGENTS.md` / `CLAUDE.md` — the owner's
  lean constraint, and a per-session token cost for a per-machine task.
- **Not** publishing course-skill content. The m5l3 allowlist stands.
- **Not** un-gitignoring `scripts/local/`, and **not** vendoring the private
  mirror. The runbook references the mirror; it does not replace it.
- **Not** automating the re-sync. Encoding the adaptation in a script is a
  separate, larger change with its own correctness risk (`AGENTS.md` warns the
  adaptation is contextual, not a mechanical find-and-replace).
- **Not** touching `manual-setup-runbook.md`'s existing external-services scope.

## Implementation Approach

A new sibling runbook under `context/foundation/`, plus three one-line pointers.
Sibling rather than a section inside `manual-setup-runbook.md`: that file's title
and stated scope are external service wiring (Cloudflare, Supabase, Replicate,
Resend, GitHub, Google), and local agent tooling is a different axis with a
different audience and trigger.

---

## Phase 1: Write the runbook

### Overview

Create `context/foundation/agent-env-setup.md` — ordered, do-this-then-this,
mirroring `manual-setup-runbook.md`'s voice.

### Changes required

**`context/foundation/agent-env-setup.md`** (new). Sections:

1. **What this is / when you need it** — first clone on a machine; after
   `10x get`; after a manual `.agents/skills` edit. State the app-side setup is
   README's job and link it, so the two do not drift into rival onboarding docs.
2. **What the clone does not contain** — the table from `change.md`, plus _why_
   (m5l3 allowlist, one sentence, linking `.gitignore:42-55`).
3. **Ordered steps**, each with its verification:
   - `npm install`
   - `10x auth` — **marked human-only** (interactive magic link; an agent must
     ask the owner to run it via the `!` prefix)
   - `10x get <lesson>` — restores `.claude/skills/10x-*/`, `.claude/prompts/`,
     the manifest; note that re-fetching a _different_ lesson removes the
     previous lesson's artifacts
   - restore `scripts/local/` from the `10x-toolkit` private mirror
   - re-sync `.agents/skills/` from `.claude/skills/`
   - `npm run check:skills` (public parity), then the full local checker
4. **The re-sync rules** — keep-list vs adapt-list, and the rule that the
   `CLAUDE.md` → `AGENTS.md` adaptation is contextual, never a naive `sed`.
   _Depth here is gated by the open decision below._
5. **Troubleshooting** — `10x doctor` first (`AGENTS.md:115`); what a
   `check:skills` failure means; the fact that hand-edits under `.claude/skills/`
   are overwritten by the next `10x get`.
6. **Cross-references** — `AGENTS.md` §10x-cli profile & workflow,
   `manual-setup-runbook.md`, `.gitignore`.

### Open decision — needs the owner, blocks only §4's depth

Does the **keep-list / adapt-list** (skill names + what is swapped) count as
"quotes course-skill content" under m5l3?

- **If no** (recommended): §4 goes in the tracked runbook in full. Skill names
  are already public — `AGENTS.md:110` lists them and `.gitignore:47-50` globs
  them — and the adaptation is a path/filename mechanic, already described
  publicly at `AGENTS.md:109`.
- **If yes**: §4 shrinks to a pointer at a local-only
  `scripts/local/skills-resync.md`, and the tracked runbook still names the
  mirror as its restore source, so the fresh-clone chain stays unbroken.

Everything else in Phase 1 is unaffected either way. Draft §4 under the
recommended reading; downgrading it later is a delete, not a rewrite.

### Success criteria

- [ ] A reader with only the clone can enumerate every absent artifact and its
      restore source.
- [ ] Every step states how to tell it worked.
- [ ] `10x auth` is unambiguously marked as a human step.
- [ ] No course-skill content is quoted (verify against the chosen reading).
- [ ] `npm run format` clean.

---

## Phase 2: Point the lean files at it

### Overview

Three pointers. No procedure text in any of them.

### Changes required

1. **`AGENTS.md:111`** — after "re-sync the `.agents/skills` copies and run
   `npm run check:skills`", append: _"Fresh machine or full procedure:
   `context/foundation/agent-env-setup.md`."_ One sentence.
2. **`README.md` §Getting Started** — a step 6 (or a line after step 5) for
   contributors using AI agents, linking the runbook. This is the signpost that
   makes the fresh-clone path discoverable; without it the runbook is only found
   by someone already reading `AGENTS.md`.
3. **`README.md` §Documentation** — add the runbook to the
   `context/foundation/` list alongside `prd.md`, `roadmap.md`, `test-plan.md`,
   `tech-stack.md`.

`CLAUDE.md` needs **no** edit — it imports `AGENTS.md` via `@AGENTS.md`, so the
pointer propagates. (Confirm at implementation time that the shim is still a
pure pointer; `AGENTS.md:108` says to move any appended content out of it.)

### Success criteria

- [ ] `AGENTS.md` grows by exactly one sentence; `wc -l` delta ≤ 1.
- [ ] `CLAUDE.md` unchanged.
- [ ] Every added link resolves (relative paths correct from each file).
- [ ] `npm run format` clean.

---

## Phase 3: Verify against the actual requirement

### Overview

The requirement is "clear for a developer on a fresh laptop", so verify by
simulating that reader rather than by re-reading what we wrote.

### Changes required

No file changes. Checks:

1. **Cold-read pass** — walk the runbook top to bottom assuming _only_ a clone
   and the README. Every command must be runnable or explicitly marked as
   needing the owner. Any step referencing a path absent from a fresh clone must
   have already named its restore source _above_ that point.
2. **Ordering check** — no step depends on an artifact restored by a later step.
   Specifically: the full local checker must come after the `10x-toolkit`
   restore, not after `10x get`.
3. **Link check** — every relative link resolves from its own file's directory.
4. **Optional, cheap** — `git stash` the ignored dirs, or clone to a temp path,
   and confirm the runbook's "what's missing" table matches reality. Cheapest
   real evidence available; do it if the clone is quick.

### Success criteria

- [ ] Cold-read produces no step that cannot be executed or delegated.
- [ ] No forward dependency in the ordering.
- [ ] All links resolve.
- [ ] The absent-artifact table matches an actual fresh clone (if run).

---

## Testing Strategy

No unit tests — this is prose. The meaningful gate is Phase 3's cold read, plus
the existing `npm run check:skills`, which already fails loudly on drift and is
the runbook's own final step.

## Risks

| Risk                                                                               | Mitigation                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The runbook drifts from the real procedure after a `10x get` changes the skill set | Its final step is `check:skills`, which fails on drift; cross-reference from `AGENTS.md:111` keeps it in the path of anyone re-syncing                                     |
| Two rival onboarding docs (README vs runbook)                                      | Runbook §1 states the split explicitly: README owns app setup, runbook owns agent tooling                                                                                  |
| m5l3 breach in §4                                                                  | Gated by the open decision above; the conservative reading is a strict subset, so the fallback is a delete                                                                 |
| `10x-toolkit` mirror details are themselves unwritten                              | Out of scope here; the runbook names it and says what it restores. If the mirror's own restore command is undocumented, that is a follow-up, not a blocker for this change |

## References

- `context/foundation/manual-setup-runbook.md` — pattern and voice
- `AGENTS.md:43`, `AGENTS.md:106-117` — the text being pointed from
- `.gitignore:42-55` — the allowlist that creates the absence
- `README.md:22-58`, `README.md:189` — insertion points
- `dcb8500` (PR #112) — the change that introduced local-only course artifacts
