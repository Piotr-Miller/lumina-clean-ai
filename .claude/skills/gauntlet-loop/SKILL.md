---
name: gauntlet-loop
description: "Run a Gauntlet Loop against this repository — an authoring-time improvement loop in which a lead agent splits a goal into independently judgeable pieces, and every piece gets a builder plus a SEPARATE critic with fresh context that inspects the real output, blind A/B-compares it with a concrete reference bar, names the single biggest remaining gap, and sends it back. Use when the user says gauntlet loop / gauntlet / pętla gauntlet, or asks to keep improving something until it beats a reference, to iterate against a comparison instead of stopping at the first decent result, or to raise the quality bar on the landing page, the enhance UI, the local engine's output, the guides, or the code-reviewer prompts. NOT a CI gate, not a bug hunt, and not a replacement for /10x-plan, /10x-implement, or /10x-tdd."
metadata:
  tags: gauntlet-loop, quality-bar, critic, blind-ab, subagents, iteration, luminaclean
---

# Gauntlet Loop

Method credit: Matt Shumer, "The Gauntlet Loop" (https://somethingbig.ai/gauntlet-loop) — the
prompting pattern behind the Claude of Duty run. The core is four moves: **give the goal, not the
implementation; give a bar the agent cannot talk its way around; let the lead split the work; never
let the builder grade itself.** Then keep looping longer than feels reasonable.

This skill is that method wired to _this_ repository — its bars, its gates, its cost limits.

## Use it when / don't

**Use it** when the output can be _inspected_ and there is something concrete to lose against: a
rendered page, an enhanced photo, a benchmark number, a frozen ground-truth finding set, a prose
reference.

**Don't use it** when:

- There is no inspectable artifact yet, or the goal itself is unclear → `/10x-frame`, then `/10x-plan`.
- The problem is a defect with a known expected value → that is a test: `/10x-tdd`, or `/code-review`
  for a bug hunt. A critic is a taste instrument, not an oracle.
- You are tempted to wire a critic into CI. **Do not.** `context/foundation/test-plan.md` §4 records a
  deliberate team decision: judging output _quality_ (before/after improvement) has no stable oracle
  and is excluded from the test stack. A gauntlet run is on-demand authoring work that a human starts
  and a human stops. Nothing in `.github/workflows/` gains a critic.

## When you decline, name what you are declining on

Every refusal above rests on something written down: a recorded decision (`context/foundation/test-plan.md`
§4 — quality judging has no stable oracle), a cost knob (`CLOUD_DAILY_CAP`, global, 3 in prod, `0` the
kill-switch), a guardrail in `references/guardrails.md`, a hard rule in `AGENTS.md`. **Name it inside the
refusal — the path and section, or the setting by name.** An unsourced "I won't do that" is
indistinguishable from the model's own taste, and taste is the one thing a declining agent must not be
running on: the user cannot check it, argue with it, or overrule it on the merits.

This is measured, not assumed. Runs 7–10 in `references/eval-matrix.md` record refusals that took exactly
the right action and dropped the anchor in half the samples on one harness — right answer, unverifiable
reason.

## Before you answer at all — read the domain

**Open `references/bars.md` and read the section for the surface you were asked about BEFORE your first
response.** Not after you have asked your questions, not once the user confirms a bar: before. This
file gives you the method and not one bar, and a lead answering from `SKILL.md` alone falls back to
asking the user to name a reference — the single move Step 0 forbids. That is not a hypothetical: it is
run 5 in `references/eval-matrix.md`, where the arms that opened `bars.md` proposed named candidates and
the arm that did not asked the user instead.

If no section fits the surface, read the closest one anyway and say which domain you are treating it as.

## Step 0 — Set the contract before the first builder runs

Write these four into the workbench and do not start without them.

1. **Goal** — the destination in one or two sentences. Not the architecture, not the file list, not the
   decomposition. Prescribing the route replaces the model's judgment with yours.
2. **Bar** — a concrete artifact or measurement the critic can open and compare against. **You propose
   it; the user confirms it.** Start from `references/bars.md`, the registry for this repo's domains;
   if nothing there fits, go and find a candidate rather than asking the user to supply one, and put it
   up in one sentence saying why it is a useful bar. Do not start building on an unconfirmed bar — the
   bar decides what every round optimises toward, and a wrong one wastes the whole run. "Make it
   amazing" and "production-ready" are not bars. A bar does not have to be realistically reachable — it
   has to stop the loop from settling at "pretty good for AI".
3. **Split** — the _lead_ decides which pieces can be improved and judged separately. Do not pre-decide
   it. "Improve the enhance page" is too large; "make this before/after slider handle read as
   deliberately designed next to the reference" is a problem an agent can attack repeatedly.
4. **Stop condition** — rounds, wall-clock, or spend, agreed with the user **up front**. "Keep looping"
   plus paid models is unbounded; ask (AskUserQuestion or equivalent) if the user has not named a
   ceiling. Record it; honour it.

Then get off `master` — it is PR-only here: `git switch -c gauntlet/<slug>`.

## Step 1 — Choose the domain and its bar

Read `references/bars.md`. It maps each gauntlet-able surface of this app to a bar that already exists
(or can be frozen once), the exact command a critic runs to inspect the real output, and what must not
drift while the loop runs.

## Step 2 — Split and fan out

One **builder** and one **critic** per piece, each critic on **fresh context**.

- Never give the critic the builder's history, diff rationale, or self-assessment. The builder has seen
  every decision it made and is excellent at explaining why they are reasonable. Reasonable is not what
  you want.
- Harness mapping — **fresh context is a requirement, not a preference**, so use the mechanism that
  actually guarantees it:
  - **Claude Code:** a new `Agent` subagent (`general-purpose`) per critic. A subagent starts clean.
    Do **not** use a fork of this conversation — a fork inherits everything, including the build.
    The `Workflow` tool is fine for deterministic fan-out; **invoking this skill is the explicit
    opt-in the Workflow tool requires**, so a workflow launched from here is authorised.
  - **Codex:** `spawn_agent` with **`fork_turns: "none"`**. The default inherits the full turn
    history, which silently defeats every rule in the critic contract. Pass the critic only its
    contract, the artifact paths, and the inspect commands.
  - **Anything else:** if you cannot prove the critic starts clean, run it as a separate session or
    process. "Probably clean" is not clean, and never in the message that produced the artifact.
- **Serialize anything that shares a port or a stack.** One `wrangler dev` on :4321, one local Supabase,
  the fixture server pinned to 8787. Render, E2E and integration rounds run one at a time; only
  pure-analysis critics fan out freely.

## Step 3 — The critic contract

`references/critic-contract.md` holds the templates and the staging procedure. Non-negotiables:

- The critic inspects the **real artifact** — the rendered pixels, the served page, the decoded output
  image, the benchmark stdout, the actual findings JSON. **Never a summary written by the builder.**
- **You stage the blind comparison, and the mapping is never written down.** A subagent shares this
  filesystem, so a mapping file anywhere in the workspace is a mapping it can read — fresh context is
  not a sandbox. Stage with `npx tsx scripts/gauntlet-stage.ts stage --ours … --bar … --round …`, hand
  the critic the two printed paths and nothing else, then recover the side after the verdict with
  `… reveal --round … --bar … --ours …`. The helper writes only into an empty directory under
  `scratchpad/gauntlet/` — symlinks resolved first — so a slipped `--round` cannot land in
  `context/archive/` or in the checkout. Normalise what leaks: dimensions, format, file size, EXIF,
  product names. Blinding here defends against incidental bias, not against a critic that goes looking.
- **Constraints are a separate, non-blind pass.** The "what must not drift" list names our files, so
  handing it to the preference critic tells it which artifact is ours.
- Output is a verdict plus **exactly one** biggest remaining gap, stated concretely enough to act on. A
  list of twelve nits is a critic that has stopped choosing.
- Where the bar is a number or a grader verdict there is nothing to blind — use referee mode, and do
  not fake blinding to look rigorous.

## Step 4 — Round gates (the part a generic gauntlet gets wrong)

A round that touched tracked source is **not finished** until the repo gates are green. Run them before
the critic's verdict counts:

```
npm run lint && npm run typecheck && npm run test:unit && npm run format:check
```

Plus, conditionally:

- touched `supabase/functions/enhance/` → `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/`
  and `deno test --config supabase/functions/enhance/deno.json supabase/functions/enhance/`
- touched a `test-plan.md` §2 risk path (cloud job lifecycle, auth gate, daily cap, IDOR, retention,
  watchdog) → the matching integration spec, and `npm run test:e2e` when the north-star flow is in scope
- touched `packages/code-reviewer/` → that package's **own** graph, which needs its own working
  directory (CI uses `working-directory: packages/code-reviewer`; from the repo root the bare commands
  would run the root project instead):
  `npm --prefix packages/code-reviewer ci && npm --prefix packages/code-reviewer run lint && npm --prefix packages/code-reviewer run typecheck && npm --prefix packages/code-reviewer test`
- touched `.claude/skills/` or `.agents/skills/` → `npm run check:skills` (public pairs are byte-identical)

**A red gate IS the biggest gap.** Report it as such no matter how good the output looks; a prettier
result that fails `format:check` has lost the round.

## Step 5 — Workbench, visible while it runs

Durable run record: `context/changes/<change-id>/gauntlet/workbench.md` — goal, bar, stop condition, the
**reference provenance ledger** (origin, rights, sha256 per reference file), and one row per round:
round, piece, verdict, revealed A/B mapping, the named gap, gate status.

Everything binary is gitignored and stays that way — this repo is public:

```
scratchpad/gauntlet/<slug>/reference/          frozen bar (never committed, hash-pinned in the workbench)
scratchpad/gauntlet/<slug>/round-<n>/<piece>/  A.<ext> + B.<ext> — the only dir a blind critic is given
```

There is deliberately no third directory: **nothing on disk says which side is ours** while the critic
is working. It is recovered by hash after the verdict.

Update the workbench **as you go**, so the user can watch from a phone instead of interrupting every
twenty minutes.

**Never write anywhere under `context/archive/`.** If a resolved target path starts with
`context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

## Step 6 — Smoothing pass

After each wave, spawn one fresh agent over the _complete_ result. Its job is coherence — reconcile
pieces that became individually good but collectively inconsistent (spacing, tone, naming, duplicated
helpers). It does not redesign. Re-run the Step 4 gates after it.

## Step 7 — Stop and hand off

Stop at the agreed condition, or when improvements stop mattering. Then report, in the user's terms:

- what measurably improved against the bar, and what is still losing;
- rounds spent and, for paid loops, approximate spend;
- every assumption the loop made that the user has not confirmed.

**Do not commit and do not push** (global rule: commits and pushes are the user's). Leave the branch,
the working tree, and the workbench; let the user decide whether this becomes a PR or feeds `/10x-plan`.

## Guardrails

`references/guardrails.md` — cost and prod safety (cloud ops are metered and capped), serving the app
correctly, the frozen-ground-truth rule, and the settings that must never leak into production config.
Read it before any loop that touches the cloud pipeline, the code-reviewer, or a served build.

## Maintaining this skill

- Both trees are **byte-identical** public skills. Edit `.claude/skills/gauntlet-loop/`, copy to
  `.agents/skills/gauntlet-loop/`, then `npm run check:skills`.
- **`.claude/` and `.agents/` are in `.prettierignore`**, so `npm run format:check` silently skips these
  files — a "formatting is clean" report from the repo-wide check means nothing here. Format them
  explicitly: `npx prettier --write --ignore-path .gitignore .claude/skills/gauntlet-loop/**/*.md`,
  then re-copy so parity holds.
- `tests/gauntlet-loop-skill.test.ts` pins the few invariants that are load-bearing and silently
  breakable (blind staging, the archive abort, the not-a-CI-gate rule, the `--prefix` gate command).
  If an edit trips it, decide whether you meant to change the contract — do not delete the assertion to
  get green.
- The staging helper is `scripts/gauntlet-stage.ts` over `scripts/lib/gauntlet-staging.ts`, covered by
  `tests/gauntlet-staging.test.ts`. Keep the logic in the lib; the CLI is a thin shell over it.
- `references/eval-matrix.md` is the behavioural check that a file test cannot do: activation, routing,
  critic isolation, stop-condition, reference privacy. Run it after any substantive edit to this skill
  and record the run in its results ledger.

> **Status: not yet released — and the first real run says why.** §2 is green on both harnesses
> (Claude Code run 11, Codex run 12, two samples per case). Run 13 then used the skill for real — three
> rounds on the enhance entry state — and **§3 failed**: asked afterwards, a critic identified our side
> with high confidence from the staged images alone, recognising the product's own engine toggle and
> format line, not just a wordmark. Masking the header changed nothing that mattered. **A domain-A blind
> A/B judged by an agent running inside this repository is not blind**, and the fix is either an
> isolated critic environment or dropping the "blind" claim for domain A — see run 13. §4 is partial
> (4.3 and 4.4 never fired), §5 is green, §1 is stale by choice while the artifact keeps changing. Treat
> this skill as a draft: supervised use on a free domain (A, C, D, F) only; never paid (E) or unattended.
