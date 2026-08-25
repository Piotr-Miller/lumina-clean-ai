# The critic contract

The critic is the only thing standing between "the builder thinks it is good" and "it is good". Every
rule here exists because dropping it collapses the loop into self-congratulation.

## Two judging modes — pick one per piece

| Mode        | When                                                                            | Domains (`bars.md`) |
| ----------- | ------------------------------------------------------------------------------- | ------------------- |
| **Blind**   | Both sides are the same kind of artifact and a human could confuse them         | A, B, D             |
| **Referee** | The bar is a number, a grader verdict, or a ground-truth set — nothing to blind | C, E, F             |

**Blind** is the mode that carries the method. **Referee** does not need blinding: a benchmark's median
milliseconds and a grader's M1/M2/M3 verdict do not care who produced the input. Do not fake blinding
where it is meaningless, and do not skip it where it is possible.

---

## Blind mode

### The lead stages the comparison — the critic never does

**The mapping is never written down.** A subagent shares this filesystem — a fresh context is not a
sandbox — so "the mapping file is in a directory I did not name to the critic" is obscurity, not
isolation. `..`, `rg`, and `Get-ChildItem` all still work. Nothing records which side is ours; after
the verdict the lead recovers it by hashing the staged files against the reference.

Stage with the helper, not by hand — it runs the same in PowerShell and Git Bash (`sha256sum` does
not), and it refuses the staging mistakes that fail silently. **One line, no `\` continuations:** those
are Bash-only, and in PowerShell — this repo's primary shell — they split the call into two broken
commands.

```
npx tsx scripts/gauntlet-stage.ts stage --ours <our artifact> --bar scratchpad/gauntlet/<slug>/reference/<name>.<ext> --round scratchpad/gauntlet/<slug>/round-<n>/<piece>
```

It prints exactly two paths — `A.<ext>` and `B.<ext>`, our side chosen by a coin, nothing else in the
directory. **Hand the critic those two paths and nothing else.** Then, only after the verdict is
recorded:

```
npx tsx scripts/gauntlet-stage.ts reveal --round <same dir> --bar <same reference> --ours <same artifact>
```

**What `stage` refuses**, rather than doing quietly: mismatched extensions; our output byte-identical to
the reference; and any `--round` that is not an empty directory under `scratchpad/gauntlet/` — traversal
and symlinks resolved first, so a slipped path cannot copy over `context/archive/` or the checkout, and
a re-used round cannot conflate two verdicts.

**What `reveal` actually proves** — narrower than "the round was not tampered with", so do not claim
more in the workbench. It checks that the directory holds exactly `A.<ext>` and `B.<ext>` and that
exactly one of them is the reference. `--ours` is optional and buys the rest: it verifies the other side
is still our artifact byte for byte. Without it, an edit confined to the ours side changes no hash the
check compares and passes unnoticed — the CLI prints that caveat when you omit it. Pass `--ours` unless
the artifact has already moved on; if it has, record that only the reference side was verified.

### What blinding here does and does not buy you

It defends against a critic's **incidental** bias toward work it recognises as ours — the failure mode
that actually shows up in practice, and the reason the method works at all.

It is **not** a sandbox. A critic that goes looking can hash the two staged files against the frozen
reference sitting elsewhere in the workspace and de-blind itself. If you need blinding that survives an
adversarial critic, run it where only the round directory is reachable — a container, a separate
checkout, or a harness with no filesystem access. Do not claim in the workbench that a verdict was
blind in a stronger sense than the setup actually delivered.

### Blinding is not just the filename — normalise what leaks

Anything asymmetric identifies the sides. Before staging, equalise:

- **Dimensions, format, compression.** Render both at the same viewport and export both the same way.
  (The helper hard-errors on mismatched extensions — the rest is on you.)
- **File size and metadata.** Strip EXIF; a 4.2 MB press screenshot next to our 180 KB render is a
  tell. The helper warns above a 4× size ratio; a warning you ignore is a verdict you must downgrade.
- **Filenames.** `A.png` / `B.png`. Nothing else in the directory.
- **In prose:** product names, house voice, and internal links. Replace the product name with the same
  neutral token on both sides, or blind at paragraph level where the surrounding brand is identical.
- **In images from the enhance flow:** both sides must be the same source photo at the same crop and
  zoom. Different crops make the comparison meaningless, blind or not.

If a leak cannot be closed, say so in the workbench and treat the verdict as **referee-grade evidence,
not a blind result**. An honest weak signal beats a blind result that was not blind.

### Blind preference critic — prompt template

This critic gets **no** repo context, no constraint list, no goal phrased in our product's terms. It
judges which artifact is better, full stop.

```
You are comparing two artifacts. You do not know who made either one and it does not matter.

TASK THEY BOTH ATTEMPT: <one or two sentences, product-neutral — "a landing page for a
  photo-enhancement tool", "a denoised version of the same night photo", "an explainer
  about why night photos come out noisy">

ARTIFACT A: <path>
ARTIFACT B: <path>

Open both yourself. Run exactly:
  <the identical inspect command for each, differing only in the path>
Do not accept any description of either artifact. Look at them.

1. Which is better for the task above? Answer A, B, or tie — and say why in terms a user
   would recognise, not in terms of technique.
2. Name THE SINGLE BIGGEST thing the weaker one would have to change to win. One. Concrete
   enough to act on. Not a list of nits.
3. If they are genuinely equivalent, say tie. Do not manufacture a difference to look
   rigorous.

Return:
  better:   A | B | tie
  why:      one paragraph
  gap:      one paragraph — what the weaker one must change
  evidence: what you actually opened or ran, and what you observed
  blocked:  "" or why you could not inspect an artifact
```

`blocked` is for a build that failed, a page that would not serve, a file that would not decode.
**`blocked` is never a pass.** Fix the harness, then re-judge.

### Reveal, then record

Record the critic's raw `better` / `why` / `gap` in the workbench **first**, then run `reveal` and
translate: ours → `WINS`, the reference → `BAR_WINS`. That order matters — revealing before the verdict
is written is how a disappointing result quietly turns into "well, it was close". Never send the
revealed side back to that critic; the next round gets a fresh one anyway.

### The constraint check is a SEPARATE pass

The "what must not drift" list in `bars.md` names our files, our helpers, our invariants — handing it
to the preference critic tells it exactly which artifact is ours. So constraints are checked by a
second, non-blind critic that never sees the reference:

```
You are checking one change against a fixed list of constraints. You are not judging
quality — another reviewer does that.

CHANGED: <paths touched this round>
CONSTRAINTS: <the "what must not drift" list for this domain, verbatim from bars.md>
GATES: <the Step 4 commands for what was touched>

Run the gates. Read the change. For each constraint, answer HOLDS or VIOLATED with the
line that shows it. Report the gate output verbatim — not a summary of it.

Return:
  gates:       pass | fail, with the failing output
  violations:  [] or one entry per violated constraint
```

**A violation or a red gate outranks the blind verdict.** A round that produced a prettier page while
breaking an accessible name has lost, whatever the preference critic said.

---

## Referee mode

The bar is a measurement, so the critic's job is to run it honestly and read it.

```
You are checking one piece against a fixed threshold. You did not build it.

PIECE: <what changed>
BAR: <the threshold and where it is written down — "~12 MP within 2 s", the frozen
      ground-truth file, the grader's expected verdict set>

MEASURE IT YOURSELF. Run exactly:
  <the harness command>
Report the raw output. Do not accept the builder's number.

The harness is FROZEN for this run. If the change modified the harness, the fixture, or
the ground truth, that is automatically the finding — report it and stop.

Return:
  verdict:  MEETS | MISSES | BLOCKED
  observed: the raw numbers or verdicts
  gap:      what would have to change to meet the bar, or "" when MEETS
```

The frozen-harness rule matters most here: a builder that "improves" a benchmark by editing the
benchmark, or a fabrication score by editing the ground truth, has produced nothing. That is the freeze
violation `assertGroundTruthFrozen` exists to catch.

---

## Spawning rules — every mode

- **Fresh context, every round, every critic.** A critic that saw the previous round argues for
  consistency with its own earlier verdict instead of judging what is in front of it.
  - Claude Code: a new `Agent` subagent per critic (a subagent starts clean; do **not** use a fork of
    this conversation, which inherits everything).
  - Codex: `spawn_agent` with **`fork_turns: "none"`** — the default inherits the full turn history,
    which silently defeats every rule in this file. Pass the critic only its contract, the artifact
    paths, and the inspect commands.
  - Any other harness: if you cannot prove the critic starts clean, run it as a separate session or
    process. "Probably clean" is not clean.
- **Never pass the builder's rationale, diff summary, commit message, or self-assessment.** The builder
  can justify every choice it made. You are not buying justification.
- **The critic opens the artifact itself** — rendered page, decoded image, benchmark stdout, findings
  JSON, served response. A critic that grades a written description grades the description.

## Builder prompt template

```
You are improving ONE piece toward a goal. You are not judging the result — a separate
critic will, against a reference you do not get to see or argue with.

PIECE / GOAL: <the smallest independently judgeable unit, and what it must achieve>

THE GAP TO CLOSE (from the last critic, verbatim):
  <the critic's gap paragraph>

Change the smallest amount that closes that gap. Do not opportunistically refactor,
rename, or "also improve" anything else — every extra change is something the critics
must now re-judge, and scope creep is how a loop stops converging.

Before you report done, the repo gates for what you touched must be green (SKILL.md
Step 4). Report what you changed and what you ran. Do not report a quality assessment;
that is not your call.
```

## Failure modes to watch for in the loop

| Symptom                                                     | What it means                                               | Fix                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Critic returns three rounds of "minor polish opportunities" | It has stopped choosing; the bar is too soft or already met | Raise the bar, or accept the win and take the piece out of the loop |
| The same gap sentence three rounds running                  | The builder is not closing it, or it is not actionable      | Re-scope the piece smaller; make the gap measurable                 |
| `better` flips A → B → A with no change between rounds      | Judgment noise, not signal                                  | Check the leak list; require `evidence`; add a second lens          |
| Ours wins every blind round from the first one              | The blinding leaked, or the bar is too low                  | Read `evidence` for tells; re-stage; raise the bar                  |
| Every round is green but the artifact is not better         | The critic is grading a summary                             | Force the inspect commands; check `evidence` names real output      |
| Rounds keep growing the diff                                | Builders are opportunistically refactoring                  | Re-issue the builder prompt's smallest-change constraint            |

## Diverse lenses beat redundant ones

For an expensive or contested piece, run 2–3 critics with **different lenses** rather than three copies
of the same one — e.g. for a UI piece: _first impression at a glance_, _does it hold up at 100 % zoom_,
_does it still pass the accessible-name / E2E locator contract_. Redundant critics agree with each
other; diverse critics find different failures. Take the harshest actionable gap.
