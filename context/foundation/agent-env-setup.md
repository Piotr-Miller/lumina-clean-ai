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

- **First clone on a machine** — the skills are simply not there. Restore them from the private
  mirror (§2.2); no login required.
- **After any `10x get`** — a re-fetch rewrites `.claude/skills/` and silently drops artifacts
  from a previously fetched lesson. The `.agents/` copies do **not** follow automatically.
- **After hand-editing anything under `.claude/skills/`** — which you should not do (see §5),
  but if you did, the trees are now out of sync.

## 1. What the clone does not contain, and why

This is a **public** repository, and the 10x-Workflow course skills are not published (course
rule, lesson m5l3). They are gitignored local artifacts, not missing files — see
[`.gitignore`](../../.gitignore) lines 42–55, which carry the same reasoning.

A fresh clone gives you only the **tracked** skills; a working environment adds the course
skills on top. **Do not memorise either count** — the tracked set is whatever `PUBLIC_SKILLS`
in [`scripts/check-skills-sync.ts`](../../scripts/check-skills-sync.ts) lists, and
`npm run check:skills` prints it back to you on every run (`… — N allowlisted skill(s)`). This
file used to restate the number and went stale twice; see the note at the end of this section.

**All of it comes from one place: the private mirror repo
[`Piotr-Miller/10x-toolkit`](https://github.com/Piotr-Miller/10x-toolkit).** It holds every
gitignored artifact — both skill trees, the prompts, the CLI manifest, and the full checker:

| Absent after `git clone`                                                          | Restored by             |
| --------------------------------------------------------------------------------- | ----------------------- |
| every non-allowlisted skill directory in **both** trees (the course skills)       | `node sync.mjs restore` |
| `.claude/prompts/`, `.claude/config-templates/`, `.claude/.10x-cli-manifest.json` | the same restore        |
| `scripts/local/` — the **full** sync checker, its config and its tests            | the same restore        |

**Restore from the mirror; do not rebuild from the CLI.** A `10x sync --all` can re-fetch the
course skills, but it is _strictly worse_ as a restore path, for three reasons:

1. **It needs an interactive magic-link login.** The mirror needs only a git clone, so an AI
   agent can complete a restore unattended — it cannot complete `10x auth`.
2. **It cannot restore the local extensions.** `10x-archive` step 6, the `10x-impl-review`
   mutation step and `SKILL.user.md` exist in no upstream bundle. The mirror carries them; a
   fetch would silently give you skills that look right and have had their local behaviour
   stripped. (This is exactly why §3.1 exists — and why it does **not** apply after a restore.)
3. **It hands you an unadapted `.agents/` tree.** The mirror snapshots both trees already
   adapted, so the whole §3 re-sync is unnecessary after a restore.

So: **the CLI is for getting _new or updated_ lessons; the mirror is for getting _this
workspace_ back.** §3's re-sync is what you run after the former, never after the latter.

Without the mirror you still get the public parity check (`npm run check:skills`), which is a
strict subset: it compares only the tracked skills. `AGENTS.md` §Commands tells you to run the
full checker after every fetch — and on a clone without a restore, that checker does not exist.
It is gitignored because it embeds course-skill content in its adaptation allowlists.

**What IS tracked**, and therefore already present after cloning — the canonical list is
`PUBLIC_SKILLS` in `scripts/check-skills-sync.ts`; this grouping only explains _why_ each is
there:

- `10x-impl-review-ci` — the single permitted course-skill exception, in **both** trees,
  byte-identical, because it powers the public CI reviewer.
- Registry-sourced non-course skills: `code-review`, `documentation`, `learning`,
  `skill-optimizer`, `typescript-magician`.
- **Repo-owned skills, authored here rather than fetched from any registry:** `gauntlet-loop`
  (on-demand quality loop, never a CI gate) and `run-local-stack` (host-specific recipe for
  running the app locally).

> ⚠️ **This list is the drift-prone part of this file.** It was written when only the first two
> groups existed and went stale **twice** without anyone noticing — `gauntlet-loop` arrived in
> PR #187 and `run-local-stack` in PR #196, and neither PR updated this file, so it under-counted
> the tracked set for weeks. That is the failure mode `lessons.md` records as _"Writing a fact
> into its canonical home leaves every pointer to it stale"_. **If you add a tracked skill, you
> must add it to `PUBLIC_SKILLS` (or the two trees drift unchecked) — and adding it here in the
> same commit is the cheap half of that obligation.** Never trust a count in this file over
> `npm run check:skills` output.

## 2. Ordered steps

Each step says how to tell it worked. Do them in order — later steps assume earlier ones.

**Steps 2.1–2.3 are the whole restore and need no login.** The 10x CLI (2.4) is only required to
fetch _new or updated_ course content, which a fresh clone does not need.

### 2.1 Install dependencies

```bash
npm install
```

✅ `npm run check:skills` runs at all (it is a `tsx` script and needs `node_modules`).

### 2.2 Restore the local-only artifacts from the private mirror

Clone the mirror and run its restore. It copies only the gitignored entries into the workspace
and never deletes anything, so it is safe to re-run:

```bash
git clone git@github.com:Piotr-Miller/10x-toolkit.git
cd 10x-toolkit
node sync.mjs status     # what exists on each side, before touching anything
node sync.mjs restore
```

The workspace is autodetected as the sibling `../LuminaClean_AI`. **If your checkout sits
anywhere else — a different directory name included — point at it explicitly** rather than
moving directories:

```bash
LUMINA_WORKSPACE=/path/to/lumina-clean-ai node sync.mjs restore
```

> ⚠️ **Keep `10x-toolkit` private.** It exists precisely because this content may not be
> published. `sync.mjs` already excludes `10x-impl-review-ci` (the public repo owns that one),
> so a restore never fights git over a tracked file.

✅ `node sync.mjs status` reports the same entry/file count on both sides, and — the real
check — `git status` in the workspace stays **clean**. Every restored path is gitignored; if
anything shows up as untracked, `.gitignore` and the mirror disagree and you must resolve that
before committing.

### 2.3 Verify the restore

```bash
npm run check:skills                          # public parity — the tracked skills
npx tsx scripts/local/check-skills-sync.ts    # full check — exists only after 2.2
```

✅ Both end `OK: no drift …`, and the public check now adds `(local course environment
detected …)` because `scripts/local/` is present. Then confirm the three local extensions
survived — these are the ones no CLI fetch can restore, so they are the point of the mirror:

```bash
grep -l "gh issue close" .claude/skills/10x-archive/SKILL.md
grep -li stryker .claude/skills/10x-impl-review/SKILL.md
ls .claude/skills/10x-impl-review/SKILL.user.md
```

**At this point the environment is fully working.** Stop here unless you need new lessons.

### 2.4 Install and authenticate the 10x CLI — only to fetch new content

Needed when you want lessons the mirror does not yet have. **Install it first — a fresh machine
has no `10x` binary**, and `10x doctor` on a clean machine just fails with `command not found`
while explaining nothing. Per the upstream README, either form works:

```bash
npm install -g @przeprogramowani/10x-cli   # shorter commands; what the rest of this file assumes
npx -y @przeprogramowani/10x-cli <command> # zero-install alternative, no global footprint
```

Then diagnose:

```bash
10x doctor    # auth, API reachability, config, version, tool directory
```

`doctor` is safe and useful **before** login — it reports auth as the only failure and confirms
the other four checks, which is how you tell "not signed in" apart from a broken environment. A
healthy pre-auth run on this repo shows `tool-dir` resolving to `.claude` with tool
`claude-code` (the correct profile).

```bash
10x auth
```

> ⚠️ **This step is human-only.** Auth is an interactive magic link. An AI agent working in this
> repo **cannot** complete it from a non-interactive shell and must ask the repo owner to run it
> — in Claude Code, by typing `! 10x auth` so the output lands in the session. This is the only
> step in this file an agent cannot do, which is why 2.2 exists and is preferred.

✅ `10x doctor` reports auth OK.

### 2.5 Fetch new or updated lessons

The active profile is **Claude Code**, so the CLI writes to `.claude/skills/` only.

```bash
10x sync --all --dry-run  # preview
10x sync --all            # pull every unlocked lesson in one shot
```

Use `10x get` for targeted work — a single lesson, artifact, or type:

```bash
10x list                                       # browse available lessons
10x get <ref> --dry-run                        # preview what a bundle would change
10x get <ref>                                  # e.g. 10x get m5l3
10x get <ref> --type skills --name <skill>     # take one upstream update
```

> ⚠️ Re-fetching a **different** lesson with `10x get` removes artifacts from the previous
> lesson that are not in the new one. Expected CLI behaviour, not a bug — but it is why
> `10x sync --all` is the right tool for a bulk refresh.

> ⚠️ A fetch **overwrites the local extensions** (§3.1) and leaves `.agents/` unadapted. So a
> fetch — unlike a restore — obliges you to run §3 in full, then re-snapshot the mirror (§3.5).

> ⚠️ A plain fetch may append a **course rules block** to `CLAUDE.md`. `AGENTS.md` requires that
> its content be moved into `AGENTS.md` (the shim is only a pointer). `--no-course-rules`
> suppresses it, but that choice persists in the CLI's `config.json` and affects later runs, so
> prefer moving the block over silently opting out.

✅ `ls .claude/skills/` shows the new skills — **check for names without a `10x-` prefix too**, as m5l4 shipped three; then §3 (incl. §3.5). A `git status` that stays clean confirms `.gitignore`'s allowlist already covers whatever arrived.

## 3. The re-sync procedure

> **Run this after a CLI fetch (§2.5) — not after a mirror restore (§2.2).** A restore already
> delivers both trees adapted and both extensions intact, and §2.3 proves it. Running §3 after a
> restore is harmless but pointless; skipping it after a fetch leaves Codex on a drifted tree.

**`.claude/skills/` is the source of truth.** `.agents/skills/` is a derived copy for Codex —
same skills, with per-tool references swapped. Codex is used daily here, so a drifted
`.agents/` tree has a real consumer; it is not a theoretical concern.

### 3.1 First, restore the hand-maintained extensions — in `.claude/`, before copying

A fetch (`10x get` or `10x sync`) overwrites managed skills, wiping local additions. Two are
deliberate and must be re-applied **before** you copy, or you will faithfully propagate their
absence. A third, `10x-impl-review/SKILL.user.md`, is a whole file the mirror carries and no
bundle recreates — check it still exists:

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

Then run both checkers from §2.3, and re-snapshot the mirror (§3.5).

### 3.5 Re-snapshot the mirror — the step that makes the next restore work

A fetch or a hand-edit only exists on this machine until the mirror is updated. **`10x-toolkit`
is the durable copy; the workspace is not.** From the mirror clone:

```bash
node sync.mjs snapshot
git add -A && git commit -m "snapshot: <what changed>" && git push
```

Other machines then pick it up with `git pull && node sync.mjs restore`.

> ⚠️ **Skipping this is how a restore silently goes stale.** The mirror is the only copy of the
> local extensions; a fetch that overwrites them and is never re-snapshotted means the next
> `restore` on any machine hands you the _pre-extension_ skills, and §2.3's three greps are what
> catch it. Treat snapshot+push as part of the fetch, not as follow-up work.

✅ `node sync.mjs status` shows matching entry/file counts on both sides.

## 4. Troubleshooting

- **Any CLI failure — run `10x doctor` before guessing.** It covers auth, API reachability,
  config, version, and tool-directory presence.
- **`check:skills` fails.** It is read-only and names the drifted pair. Re-derive from §3;
  do not hand-patch `.agents/` to make the check pass, because `.claude/` is the source of
  truth and a hand-patch hides which side is wrong.
- **A hand-edit under `.claude/skills/` vanished.** Expected — the next `10x get` for the same
  lesson overwrites it. If the edit must survive, its spec belongs in `AGENTS.md` (§3.1), not
  in the skill.
- **The full checker is missing.** You skipped the restore (§2.2) — `scripts/local/` lives only
  in the mirror. The public check still works and is honest about its narrower scope.
- **`sync.mjs` says `workspace not found`.** It autodetects the sibling `../LuminaClean_AI`; a
  differently-named or non-sibling checkout needs `LUMINA_WORKSPACE=<path>`.
- **A restored skill is missing its local extension.** Someone fetched without re-snapshotting
  (§3.5). Re-apply from `AGENTS.md` (§3.1), then snapshot and push.
- **Switching the managed profile.** Re-run `10x get <ref> --tool <name>`; the CLI prompts to
  migrate existing artifacts. Verify afterwards with `10x doctor`.

## 5. Rules worth restating

- Lesson artifacts are **managed by the CLI, not edited by hand**.
- `.claude/skills/` is the source of truth; `.agents/skills/` is derived.
- **Never commit a skill that is not on the allowlist**, nor `.claude/prompts/`,
  `.claude/config-templates/`, the CLI manifest, or `scripts/local/`. Publication is
  **deny-by-default**: `.gitignore` ignores every skill directory and re-includes only the
  eight tracked ones (the same set as `PUBLIC_SKILLS` in `scripts/check-skills-sync.ts` and in
  the mirror's `sync.mjs`). ⚠️ **Do not think of this as "the `10x-*` skills".** That prefix was
  the rule until 2026-09-01, and m5l4 walked straight past it: `pack-init`, `setup-cicd` and
  `tf-registry` are course skills carrying no `10x-` prefix, so they sat untracked in this
  public repo, one `git add -A` from publication (PR #207). `.gitignore` enforces the rule, but
  a `git add -f` would defeat it. After a restore, a clean `git status` is the proof it holds.
- **The mirror is the durable copy, not this workspace.** Anything gitignored here survives only
  because `10x-toolkit` has it. Snapshot after every fetch or hand-edit (§3.5).
- The **upstream README is authoritative** for CLI install/usage:
  <https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md>

## See also

- [`AGENTS.md`](../../AGENTS.md) §10x-cli profile & workflow — the rules; §Commands — the
  checker split; §Archive workflow extensions and §Mutation testing — the two specs from §3.1.
- [`manual-setup-runbook.md`](./manual-setup-runbook.md) — the same shape for **external
  services**; that file plus this one cover everything a clone cannot reproduce.
- [`.gitignore`](../../.gitignore) lines 42–55 — what is deliberately unpublished, and why.
