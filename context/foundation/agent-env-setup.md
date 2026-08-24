# Agent Environment Setup — restoring the AI tooling a fresh clone cannot reproduce

**Ordered, do-this-then-this actions** to get the AI-agent tooling working after cloning this
repo onto a new machine, and to re-sync the two skill trees after every `10x get`.

> **Scope split:** [`README.md`](../../README.md) §Getting Started owns **application** setup
> (deps, Supabase, `.env`, dev server) and is enough to run and hack on the app. This file owns
> the **agent tooling** — the 10x-Workflow skills and the two synced skill trees. You do not
> need this file to build or deploy LuminaClean AI; you need it to work on it with Claude Code
> or Codex at full capability.

> The rules themselves live in [`AGENTS.md`](../../AGENTS.md) §10x-cli profile & workflow.
> **This file is the _procedure_; `AGENTS.md` is the _contract_.** When they disagree, the
> upstream 10x-cli README wins, then `AGENTS.md`, then this file.

---

## 0. When you need this

- **First clone on a machine** — the skills are simply not there.
- **After any `10x get`** — a re-fetch rewrites `.claude/skills/` and silently drops artifacts
  from a previously fetched lesson. The `.agents/` copies do **not** follow automatically.
- **After hand-editing anything under `.claude/skills/`** — which you should not do (see §5),
  but if you did, the trees are now out of sync.

## 1. What the clone does not contain, and why

This is a **public** repository, and the 10x-Workflow course skills are not published (course
rule, lesson m5l3). They are gitignored local artifacts, not missing files — see
[`.gitignore`](../../.gitignore) lines 42–55, which carry the same reasoning.

So a fresh clone gives you **6 skills per tree**; a working environment has **33**. The gap is
restored from **two different places**, and only one of them is the 10x CLI:

| Absent after `git clone`                                                         | Restored by                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `.claude/skills/10x-*/` and `.agents/skills/10x-*/` (27 course skills, per tree) | `10x get <lesson>` — then the §3 re-sync for `.agents/`    |
| `.claude/prompts/`, `.claude/.10x-cli-manifest.json`                             | the same `10x get`                                         |
| `scripts/local/` — the **full** sync checker and its config                      | the private mirror repo `10x-toolkit` (`sync.mjs` restore) |

**The last row is the one that surprises people.** `AGENTS.md` §Commands tells you to run the
full checker after every `10x get` — and on a fresh clone that checker does not exist. It is
gitignored because it embeds course-skill content in its adaptation allowlists, so it cannot
live in a public repo. Without restoring it you still get the public parity check
(`npm run check:skills`), which is a strict subset: it compares only the 6 tracked skills.

**What IS tracked**, and therefore already present after cloning:

- `10x-impl-review-ci` — the single permitted course-skill exception, in **both** trees,
  byte-identical, because it powers the public CI reviewer.
- Five registry-sourced non-course skills: `code-review`, `documentation`, `learning`,
  `skill-optimizer`, `typescript-magician`.

## 2. Ordered steps

Each step says how to tell it worked. Do them in order — later steps assume earlier ones.

### 2.1 Install dependencies

```bash
npm install
```

✅ `npm run check:skills` runs at all (it is a `tsx` script and needs `node_modules`).

### 2.2 Install and authenticate the 10x CLI

```bash
10x doctor    # diagnoses auth, API reachability, config, version, tool directory
```

If it reports missing auth:

```bash
10x auth
```

> ⚠️ **This step is human-only.** Auth is an interactive magic link. An AI agent working in
> this repo **cannot** complete it from a non-interactive shell and must ask the repo owner to
> run it — in Claude Code, by typing `! 10x auth` so the output lands in the session.

✅ `10x doctor` reports auth OK and validates the `.claude/` tool directory.

### 2.3 Fetch the course skills

The active profile is **Claude Code**, so `10x get` writes to `.claude/skills/` only.

```bash
10x list                 # browse available lessons
10x get <ref> --dry-run  # preview what a bundle would change
10x get <ref>            # e.g. 10x get m5l3
```

> ⚠️ Re-fetching a **different** lesson removes artifacts from the previous lesson that are not
> in the new one. This is expected CLI behaviour, not a bug — but it is why §3 exists.

✅ `ls .claude/skills/` shows the `10x-*` skills; `.claude/.10x-cli-manifest.json` exists.

### 2.4 Restore the full checker

Restore `scripts/local/` from the private `10x-toolkit` mirror (its `sync.mjs` restore path).

✅ `npx tsx scripts/local/check-skills-sync.ts` runs instead of erroring on a missing file.

### 2.5 Re-sync the `.agents/` tree

Follow §3 below — this is the part with actual rules, not a copy.

### 2.6 Verify

```bash
npm run check:skills                          # public parity — always available
npx tsx scripts/local/check-skills-sync.ts    # full check — needs 2.4
```

✅ The public check ends `OK: no drift (30 file pairs byte-compared).` and notes that a local
course environment was detected. The full checker adds manifest hashes, extension sentinels,
and the adaptation allowlists.

## 3. The re-sync procedure

**`.claude/skills/` is the source of truth.** `.agents/skills/` is a derived copy for Codex —
same skills, with per-tool references swapped. Codex is used daily here, so a drifted
`.agents/` tree has a real consumer; it is not a theoretical concern.

### 3.1 First, restore the hand-maintained extensions — in `.claude/`, before copying

A `10x get` overwrites managed skills, wiping local additions. Two are deliberate and must be
re-applied **before** you copy, or you will faithfully propagate their absence:

1. **`10x-archive` step 6** — the tracker-sync + `gh issue close` behaviour. Spec:
   `AGENTS.md` §Archive workflow extensions.
2. **`10x-impl-review` mutation-testing step** — the conditional scoped `stryker run`. Spec:
   `AGENTS.md` §Mutation testing.

Both specs live in `AGENTS.md` precisely because the skills they describe get overwritten. That
is the durable-fallback pattern; treat `AGENTS.md` as authoritative over the fetched skill.

### 3.2 Copy the tree 1:1

```bash
cp -r .claude/skills/. .agents/skills/
```

### 3.3 Apply the adaptations — contextually, never with a blind find-replace

> ⛔ **Do not** run a naive `CLAUDE.md` → `AGENTS.md` replace over the tree. It has been done
> and it produced nonsense like "`AGENTS.md` / `AGENTS.md`" in roughly 15 places across 6
> skills, requiring a full regeneration to fix. Every swap below is a judgement about what the
> sentence _means_.

**Adapt** — these are per-tool references, where the text means "the thing my agent reads":

| Skill                | What to adapt                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `10x-agents-md`      | `- Claude Code → <tool>` mapping lines → `- Codex → …`; `CLAUDE.md` where it means "this agent's rules file" |
| `10x-roadmap`        | the same `- Claude Code → <tool>` mapping line                                                               |
| `10x-e2e`            | `CLAUDE.md` in `SKILL.md` **and** `references/e2e-quality-rules.md`                                          |
| `10x-impl-review`    | the "see CLAUDE.md → Mutation testing" pointer, in `SKILL.md` **and `SKILL.user.md`**                        |
| `10x-rule-review`    | `@CLAUDE.md` → `@AGENTS.md`, and `~/.claude/CLAUDE.md` → `~/.codex/AGENTS.md`                                |
| `10x-infra-research` | `Claude/AI agent` → `Codex/AI agent`                                                                         |
| `10x-stack-assess`   | the "Add … to CLAUDE.md" compensation targets (4 spots)                                                      |

**Keep unchanged** — adapting these makes the text wrong or self-referential:

- Generic enumerations naming _both_ files — "CLAUDE.md / AGENTS.md", "(CLAUDE.md, AGENTS.md)" —
  in `10x-bootstrapper`, `10x-health-check`, `10x-rule-review`, `10x-stack-assess`,
  `10x-test-plan`, and their `references/`.
- `10x-cli-guide`'s tool-profile table and doctor troubleshooting rows: the `.claude/` entries
  there are **factual statements about the CLI**, not references to the reading agent.
- `10x-agents-md`'s "Existing rich CLAUDE.md" edge case — adapting it makes the passage
  describe itself.

### 3.4 Verify the result

```bash
# the naive-replace regression must be absent
grep -rE "AGENTS\.md( /|,) AGENTS\.md" .agents/skills/    # expect: no matches

# exactly these 7 skills should differ from their .claude counterparts
for s in $(ls .claude/skills/); do
  diff -rq ".claude/skills/$s" ".agents/skills/$s" >/dev/null 2>&1 || echo "$s"
done
```

✅ The second command prints exactly: `10x-agents-md`, `10x-e2e`, `10x-impl-review`,
`10x-infra-research`, `10x-roadmap`, `10x-rule-review`, `10x-stack-assess`. Every other skill
is byte-identical across the trees. **A skill appearing or missing from that list is drift** —
either an adaptation was skipped, or one was applied where §3.3 says to keep the text.

Then run both checkers from §2.6.

## 4. Troubleshooting

- **Any CLI failure — run `10x doctor` before guessing.** It covers auth, API reachability,
  config, version, and tool-directory presence.
- **`check:skills` fails.** It is read-only and names the drifted pair. Re-derive from §3;
  do not hand-patch `.agents/` to make the check pass, because `.claude/` is the source of
  truth and a hand-patch hides which side is wrong.
- **A hand-edit under `.claude/skills/` vanished.** Expected — the next `10x get` for the same
  lesson overwrites it. If the edit must survive, its spec belongs in `AGENTS.md` (§3.1), not
  in the skill.
- **The full checker is missing.** You skipped §2.4. The public check still works and is
  honest about its narrower scope.
- **Switching the managed profile.** Re-run `10x get <ref> --tool <name>`; the CLI prompts to
  migrate existing artifacts. Verify afterwards with `10x doctor`.

## 5. Rules worth restating

- Lesson artifacts are **managed by the CLI, not edited by hand**.
- `.claude/skills/` is the source of truth; `.agents/skills/` is derived.
- **Never commit** `10x-*` skills (other than `10x-impl-review-ci`), `.claude/prompts/`, the CLI
  manifest, or `scripts/local/`. `.gitignore` enforces this, but a `git add -f` would defeat it.
- The **upstream README is authoritative** for CLI install/usage:
  <https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md>

## See also

- [`AGENTS.md`](../../AGENTS.md) §10x-cli profile & workflow — the rules; §Commands — the
  checker split; §Archive workflow extensions and §Mutation testing — the two specs from §3.1.
- [`manual-setup-runbook.md`](./manual-setup-runbook.md) — the same shape for **external
  services**; that file plus this one cover everything a clone cannot reproduce.
- [`.gitignore`](../../.gitignore) lines 42–55 — what is deliberately unpublished, and why.
