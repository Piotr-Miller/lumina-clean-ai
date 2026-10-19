# Close out the advisory AI review direction — Implementation Plan

## Overview

The recorded evidence answers the change's question: **0 of the 55 accepted glm-5.3 low findings warranted a fix**.
The owner's delegated decisions of 2026-10-19 are to **end the advisory-review work without a paid pilot and keep
`ai-review` disabled**. This plan formalizes that close-out:

- **Fix the one W1 found.** `247-I5` is the service-role key fragment printed by the placeholder check of both
  `scripts/prod-*.py`.
- **Record the decision and its evidence,** with dormant pilot criteria for a later owner decision.
- **Capture the lesson.**
- **Correct every live pointer** that still says the workflow is waiting for a finder.
- **Close the tracker issue** for the outage that started this line of work.

No model is called and nothing is spent.

## Current State Analysis

**What the research and decisions established:**

- **The findings.** Research `context/changes/advisory-review-analysis/research.md` checked all 60 published glm-5.3
  low findings against the PR heads. The owner-delegated classification is in
  `context/changes/advisory-review-analysis/worth-fix-sheet.md` § Delegated owner decisions:
  - **W1 0/55.** Optional W2 20/55, after `269-I12` moved to W3. W3 32/55. FA 3/55.
  - D2 stays W2. `247-I5` is W1. It was raised by glm-5.3 high and sonnet-5 low, never by glm-5.3 low.
  - Origin: user (owner-delegated to Codex, 2026-10-19).
- **The direction.** End the work, run no paid pilot, keep `ai-review` off. If the work is reopened later: five new
  PRs that change product behaviour, glm-5.3 low, run locally from a `feat/finder-glm-5-3` worktree, counting only
  W1 that CI or `/rune-impl-review` did not already catch. Origin: user, 2026-10-19
  (`context/changes/advisory-review-analysis/change.md` § Delegated decisions).
- **This plan's own decisions** (2026-10-19, `/rune-plan` questions):
  - fix `247-I5` in this change;
  - close #235 as not planned;
  - add one lesson;
  - eligibility is path-based, and refactors count.

  Origin: user.

**The live repository today:**

- **The `ai-review` job is guarded by `false &&`** (`.github/workflows/review.yml:29`). Its comment at `:23-27` still
  says that change `finder-verification` "measures a verified finder" and that "the change that deploys a finder
  which passes those gates removes the `false &&` line".
  - `finder-verification` has been archived since 2026-10-05, and no finder passed.
  - A second comment, at `:218-221`, still calls the finder's root cause "a one-command variable swap". No swap
    passed the gates.
- **`AGENTS.md:124` describes the workflow in the present tense.** It never says that the workflow is disabled.
- **`.github/workflows/review.yml` and `AGENTS.md` are the whole stale pointer set.** Lesson: _Writing a fact into
  its canonical home leaves every pointer to it stale_. The grep of 2026-10-19 covered the live tree outside
  `context/archive/`, with the patterns `false &&`, `verified finder`, `passes those gates`, `re-enabl`,
  `stays off|stays disabled`, `OPENROUTER_REVIEW_MODEL`, `until a finder` and `R11`. Checked and not stale:
  - `context/foundation/roadmap.md` and `context/foundation/github-issues.md`: no AI-review item or mapping;
  - `context/foundation/review-pipeline-verification.md`: a dated measurement record;
  - `.github/actions/ai-review/action.yml`: an input description only;
  - `packages/code-reviewer/src/config.ts`: describes the env chain, not production status.
- **Issue #235 is open** (label `bug`, 2026-09-20): "ai-review: finder crashes with AI_NoObjectGeneratedError on a
  documentation-only diff…". It is the outage that began the finder series. Its root cause is recorded in
  `context/archive/2026-09-24-finder-serialization-outage/`.
- **Repository settings** (`gh variable list`, `gh secret list`, 2026-10-19):
  - `OPENROUTER_REVIEW_MODEL=z-ai/glm-4.6` and `OPENROUTER_JUDGE_MODEL=anthropic/claude-sonnet-5`;
  - secret `OPENROUTER_API_KEY`.

  Only the disabled job reads them.

- **`247-I5` in the scripts.** Both scripts print `KEY[:24] + "..."` when the key contains `<` or `>`:
  `scripts/prod-fetch-results.py:52-54` and `scripts/prod-result-dimensions.py:56-58`.
  - Both promise that the key is "never stored, logged or printed" (`:14-15` and `:17-18`).
  - The dimensions script already has the right idiom for describing a bad key without echoing it:
    `f"{len(KEY)} chars, {KEY.count('.')} dots"` (`scripts/prod-result-dimensions.py:64-67`).
  - Both scripts are byte-identical to the #247 head `dec09f8`; their only commit is `14762bc`.
- **Sibling of `247-I5`, checked and left alone.** `scripts/local-reset-smoke.ts:110,118` prints 24 characters of a
  reset `token_hash`. That script hard-fails on any non-local `SUPABASE_URL` (its docstring, `:17-18`), the token
  belongs to a throwaway local user, and printing the `pkce_` prefix is the point of the smoke.

### Carried from predecessor

`change.md` § Notes names its predecessors in prose ("Predecessors: finder-glm-5-3 … and finder-glm-5-3-high …")
rather than on a `Predecessor:` line. Both records were read anyway, from their unmerged branches:
`origin/feat/finder-glm-5-3` `ac6bbb1` and `origin/feat/finder-glm-5-3-high` `0cbf03e`. Neither has a
`follow-ups/` folder.

| Item                                                                                                   | Source (path + finding)                                                                           | Disposition                                                                                                                                                      | Addressed in                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| glm-5.3 plan review F1–F5 and implementation reviews of phases 1–5                                     | `context/archive/2026-10-11-finder-glm-5-3/reviews/*.md` (branch `feat/finder-glm-5-3`)           | resolved: every Decision `FIXED`; phase-2 Re-review 2 `Closes: F1–F6`                                                                                            | —                                                 |
| glm-5.3-high plan review F1–F12 and implementation reviews (phase 1, phase 2 F1–F7, full `7dcb3e7` F1) | `context/archive/2026-10-16-finder-glm-5-3-high/reviews/*.md` (branch `feat/finder-glm-5-3-high`) | resolved: every Decision `FIXED`; plan review Re-review 2 `Closes: F1–F10`                                                                                       | —                                                 |
| Amendment 1 operator checks become runner checks                                                       | glm-5.3-high `plan.md` § Carried from predecessor                                                 | resolved there (its Phase 2 § 4)                                                                                                                                 | —                                                 |
| "Predecessor Phase 7 not run (workflow flip, stale pointers, variable deletion, G5)"                   | glm-5.3-high `plan.md` § Carried from predecessor                                                 | superseded: no finder was admitted and the direction ends, so the workflow stays off, the variables stay and G5 never runs. The stale-pointer part is done here. | Phase 3                                           |
| A technical judge failure without a judge retry line is recorded only as `exit-<n>` (pr269-06)         | glm-5.3-high `plan.md` § Carried from predecessor                                                 | superseded: the gate tooling stays dormant on the branches. It is listed as a known tooling limit for a reopened pilot.                                          | Phase 2 (`close-out.md` § Dormant pilot criteria) |

## Definitions

| Term                           | Decided meaning                                                                                                                                                                                                                                                                                                                          | Origin                                                                                             | On degenerate data                                                                                                                                                                                                                  | Verified by                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| W1 fix-worthy                  | A concrete defect with a plausible failure in how the code is actually used, worth the author's time. W2 (valid, optional), W3 (noise) and FA (false) are not "worth a fix".                                                                                                                                                             | user (owner-delegated, 2026-10-19; `worth-fix-sheet.md` § Classes and § Delegated owner decisions) | D2 (a real leak, but a manual tool on a licensed corpus with no observed trigger) is W2. `247-I5` (a partial secret on the terminal of a tool whose output is pasted onward) is W1. Tooling is no exemption.                        | 1.1 (the one W1 is fixed); 2.5 (the adopted counts in `close-out.md`)    |
| End the advisory-review work   | No further finder measurement and no paid pilot under this direction. `false &&` stays. Re-entry needs a new owner decision that opens a new change, and that change pre-registers the criteria. **Unchanged:** `packages/code-reviewer`, the `code-reviewer` CI job, the `feat/finder-glm-5-3*` branches, the secret and the variables. | user (direction, 2026-10-19). What stays unchanged is A1, owner-confirmed 2026-10-19.              | A later PR that deletes `false &&` without a new change contradicts both the job comment and `AGENTS.md`, which say that removing the line alone is not a re-entry.                                                                 | 3.2, 3.4, 3.7                                                            |
| Eligible pilot PR              | A merged PR whose diff changes at least one non-test file under `src/`, `supabase/functions/` or `supabase/migrations/`. A test file is a path under `tests/` or a name matching `*.test.*` or `*.spec.*`. Refactors count. The sample is the first five such PRs in merge order after the reopening change's seal, with no picking.     | user (2026-10-19, path-based with refactors)                                                       | A refactor in `src/` is eligible. A tests-only diff is not. A root `package.json` bump is not. A migration plus docs is eligible. A PR changing only `src/**/x.test.ts` is not. `supabase/functions/enhance/deno.json` is eligible. | 2.5 (`close-out.md` states the rule and a `git diff --name-only` recipe) |
| Already caught (pilot scoring) | An AI-review W1 counts only when no failed CI check on the reviewed head and no `/rune-impl-review` finding of that change names the same defect, whatever that finding's Decision.                                                                                                                                                      | user for the rule (2026-10-19). How a match is judged is A2, owner-confirmed 2026-10-19.           | An impl-review finding that was DISMISSED still counts as caught. A PR without a plan has no impl review, so only CI counts. A differently worded description of the same defect is the owner's call at classification.             | 2.5                                                                      |

## Desired End State

- **The W1 is fixed.** Neither `scripts/prod-*.py` prints any character of a key that still contains `<` or `>`. Both
  scripts still exit 1 with a message that says what to fix. `key-echo-check.py` proves this for both scripts and
  both key-error paths, without touching the network.
- **The change records its decision.** `close-out.md` holds the decision, the adopted numbers, what stays as it is,
  how to re-enter, and the dormant pilot criteria.
- **`research.md` carries the adopted decisions** as a dated follow-up, so its 21/55 and its "W1 0 for every
  candidate" are no longer the last word.
- **`lessons.md` has one new rule.**
- **No live document says the workflow is waiting for a finder.** The `review.yml` comment and `AGENTS.md` say it was
  disabled on 2026-10-04 and that the direction ended on 2026-10-19 (change `advisory-review-analysis`), and they
  state the re-entry condition. `false &&` is untouched.
- **#235 is closed as not planned,** with a comment that points to the close-out. `temp_steps.md` names
  `/rune-archive advisory-review-analysis` as the next action.

### Key Discoveries:

- `scripts/prod-result-dimensions.py:64-67` is the in-repo precedent for describing a bad key by shape, never by
  content.
- Both scripts run their key checks at module level before the first network call (`scripts/prod-fetch-results.py:67`,
  `scripts/prod-result-dimensions.py:101`). A synthetic key therefore exits before any I/O. The check also sets
  `SUPABASE_URL=https://example.invalid`, so a reordered check would die on the URL regex instead of reaching
  production.
- `/rune-archive` moves the folder to `context/archive/<created-date>-<change-id>/`
  (`.claude/skills/rune-archive/SKILL.md:15`), which is `context/archive/2026-10-17-advisory-review-analysis/`. So
  `review.yml` and `AGENTS.md` name the **change**, not the `context/changes/…` path, and the pointers stay valid
  after archiving.
- `review.yml` parses with the root `yaml` package (`node -e "require('yaml').parse(…)"`); `actionlint` is not
  installed.

## What We're NOT Doing

- **No paid pilot, no model call, no OpenRouter or GitHub-variable change.** The secret `OPENROUTER_API_KEY` and the
  variables `OPENROUTER_REVIEW_MODEL` / `OPENROUTER_JUDGE_MODEL` stay as they are (A1). Removing them would make a
  later re-entry more expensive and protects nothing while the job is `false &&`.
- **The workflow stays dormant, not deleted.** `false &&`, the job body, `packages/code-reviewer` and its required
  `code-reviewer` CI check all stay.
- **No W2 fixes** in the scripts: `247-I1`–`I4`, `247-I6`–`I9`, D2 (`269-I8`), `269-I1`, `269-I7`, `269-I9` and
  `269-I11`. The owner rated them optional, and Phase 1 touches only the two placeholder branches.
- **No merge or deletion of `feat/finder-glm-5-3` or `feat/finder-glm-5-3-high`.** They hold the only copies of the
  glm-5.3 evidence.
- **No edit under `context/archive/`.** That includes the known `8/8` vs `8/10` discrepancy in
  `context/archive/2026-10-09-finder-failure-scenario/change.md:50`, which the research records instead.
- **No sealed pre-registration of the pilot.** `close-out.md` holds a draft. Sealing it belongs to the change that
  reopens the work.

## Implementation Approach

Four small phases, ordered so that each pointer refers to something that already exists:

1. Fix the code: independent, and the only executable change.
2. Write the record.
3. Point the live documents at the record by change name.
4. Close the tracker issue and refresh the resume file. Both happen only after the branch is pushed, so the issue
   comment can carry a permalink.

`/rune-archive advisory-review-analysis` (outcome `completed`) follows the plan as its own step.

**Assumptions** (confirmed by the owner on 2026-10-19; each stays reversible):

- **A1. Repository settings stay.** The secret, the variables, the package, its CI job and the branches stay as they
  are. "End the work" stops spending and experimenting; it does not dismantle a dormant capability.
- **A2. "Same defect" is the owner's call.** Whether a pilot W1 matches a CI failure or an impl-review finding is
  decided by the owner at classification, with the matching rule written down before reading.
- **A3. The proposed decision rule for a reopened pilot:**
  - **≥ 1 W1 not already caught** in the five eligible PRs → open a change to consider re-enabling;
  - **0** → the direction stays ended.
  - FA, W2 and W3 counts and the spend are reported but decide nothing.
  - This is a proposal in `close-out.md`. The reopening change confirms or replaces it before sealing.

## Phase 1: Stop printing the supplied key in the placeholder check

### Overview

Close the only W1 the analysis found: both scripts echo the first 24 characters of a key that still contains `<` or
`>`.

### Changes Required:

#### 1. The two placeholder branches

**Files**:

- `scripts/prod-fetch-results.py`, `scripts/prod-result-dimensions.py`: the `if "<" in KEY or ">" in KEY:` branch
  only.

**Intent**: The `found:` part of the placeholder error must describe the supplied value without reproducing any of
its characters. That keeps the scripts' own "never stored, logged or printed" contract for the one mistake this check
exists to catch: pasting a real `sb_secret_…` inside the angle brackets.

**Contract**:

- `die("SUPABASE_SERVICE_ROLE_KEY still contains a placeholder", <found>, <fix>)` keeps its `what` and `fix` texts.
- `<found>` is built from properties of the value only, never from a slice. The precedent is the shape message at
  `scripts/prod-result-dimensions.py:64-67`, for example `f"{len(KEY)} chars, still containing < or >"`.
- No other line of either script changes: not the docstrings (they already promise "never printed"), not the order
  of the checks, not the W2 issues.

#### 2. The key-echo check

**File**: `context/changes/advisory-review-analysis/key-echo-check.py`

**Intent**: Pin the fix with a check that fails on the leak, covers both scripts and both key-error paths, and cannot
reach the network.

**Contract**: The file holds exactly the script below. An identical scratch copy ran at planning and exited 1: every
placeholder case leaked 8 four-character windows of the secret, while the empty-key cases passed.

```python
import os, subprocess, sys
secret = "QZJX7W4KQZJX7W4K"
bad = 0
for script in ("scripts/prod-fetch-results.py", "scripts/prod-result-dimensions.py"):
    for key, expect in ((f"<sb_secret_{secret}>", "still contains a placeholder"), ("", "is not set")):
        env = {**os.environ, "SUPABASE_SERVICE_ROLE_KEY": key, "SUPABASE_URL": "https://example.invalid"}
        p = subprocess.run([sys.executable, "-I", script], env=env, capture_output=True, text=True, timeout=30)
        out = p.stdout + p.stderr
        leaks = sorted({secret[i:i + 4] for i in range(len(secret) - 3) if secret[i:i + 4] in out})
        ok = p.returncode == 1 and expect in out and not leaks
        print(f"{script} key={'placeholder' if key else 'empty'}: exit {p.returncode}, leaked: {leaks or 'none'} -> {'ok' if ok else 'FAIL'}")
        bad += not ok
sys.exit(1 if bad else 0)
```

### Success Criteria:

#### Automated Verification:

- The key-echo check passes for both scripts and both key-error paths:
  `python3 -I context/changes/advisory-review-analysis/key-echo-check.py` — at planning: exit 1 — expected until
  Phase 1 (scratch copy; both placeholder cases leak `KEY[:24]`).
- Both scripts still parse:
  `python3 -I -c 'import ast,sys; [ast.parse(open(p, encoding="utf-8").read(), p) for p in sys.argv[1:]]' scripts/prod-fetch-results.py scripts/prod-result-dimensions.py`
  — at planning: exit 0.

#### Manual Verification:

- The diff of both scripts touches only the placeholder branch. The new `found:` text still tells the maintainer what
  is wrong without showing any part of the key — surface: `scripts/prod-fetch-results.py`,
  `scripts/prod-result-dimensions.py`.

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated
verification passes, then asks the human about these; a pending manual check is reported, not a blocker for the next
phase.

---

## Phase 2: Record the close-out

### Overview

Write the decision, its evidence and the dormant pilot criteria where a later reader will look first. Bring
`research.md` in line with the adopted decisions, and add the lesson.

### Changes Required:

#### 1. The close-out record

**File**: `context/changes/advisory-review-analysis/close-out.md`

**Intent**: The single place that says what was decided, on what evidence, what stays as it is, and what a reopening
must do. It is the companion that `review.yml` and `AGENTS.md` point to by change name.

**Contract**: These `##` sections, in order:

- `## Decision`. End the work, no paid pilot, `ai-review` stays off. Dated 2026-10-19, owner-delegated to Codex. Also
  the four `/rune-plan` decisions of the same day.
- `## Evidence (adopted)`:
  - glm-5.3 low: W1 0/55, W2 20/55, W3 32/55, FA 3/55; 0 W1 among its 35 distinct issues.
  - `247-I5` W1, raised by glm-5.3 high and sonnet-5 low.
  - Production glm-4.6: 2 fixes against at least 37 false findings.
  - 1 of 85 PRs merged since 2026-09-01 changed product source.
  - Each figure cites `research.md` or `worth-fix-sheet.md`.
- `## What stays as it is`. A1, item by item.
- `## Re-entry`. A new owner decision opens a new change, and that change seals these criteria first. Deleting
  `false &&` alone is not a re-entry.
- `## Dormant pilot criteria`. Subsections:
  - **Candidate and location:** glm-5.3 low, run locally from a worktree of `feat/finder-glm-5-3` `ac6bbb1`.
  - **Eligible PRs:** the Definitions row, plus the recipe
    `git diff --name-only <base>...<head> -- src supabase/functions supabase/migrations` with test paths filtered.
  - **Sample:** the first five in merge order, one review each, on the final head after CI and any
    `/rune-impl-review`.
  - **Classes:** W1–W3 and FA, copied from `worth-fix-sheet.md`.
  - **Scoring:** "already caught" (Definitions, A2).
  - **Decision rule:** A3.
  - **Budget and prerequisites:** $2 cap; raise the key limit first, since the recorded headroom is $0.541037; re-read
    the account credit; the CI secret's key is unknown.
  - **Known limits:**
    - n = 5, and one run per PR samples run-to-run variance once;
    - at about one product-code PR every seven weeks, filling the sample may take months;
    - the dormant runner records a judge failure without a retry line only as `exit-<n>`.
- `## Tracker`. Filled in Phase 4.

#### 2. The research follow-up

**File**: `context/changes/advisory-review-analysis/research.md`

**Intent**: Stop the research's proposed numbers from reading as final. Append, never rewrite.

**Contract**: The research skill's follow-up convention:

- frontmatter `last_updated: 2026-10-19`, `last_updated_by`, and
  `last_updated_note: "Added the adopted owner-delegated decisions"`;
- a new final section `## Follow-up Research 2026-10-19: adopted decisions` naming each delta: `269-I12` → W3, so
  W2 20/55 and W3 32/55; `247-I5` → W1, so "W1 0 for every candidate" no longer holds for glm-5.3 high and sonnet-5
  low; the three disputed accepts → FA; D2 → W2; and the direction;
- a pointer to `worth-fix-sheet.md` and `close-out.md`.

Nothing above the new section changes.

#### 3. The lesson

**File**: `context/foundation/lessons.md`

**Intent**: Several changes in a row spent their budget on gates that asked "is this finding real?" on frozen PRs of
dormant tooling. Make that pattern a prior for the next frame, research, plan or plan review.

**Contract**: One new `##` block appended at the end, in the ledger's shape:

- a title stating the rule;
- `- **Context**:`, `- **Problem**:` (glm-5.3 low: 55/60 accepted, 0/55 worth a fix; a corpus of #247 and #269
  maintainer tooling whose only known defect, D2, is itself W2; 1 of 85 merged PRs changed product source);
- `- **Rule**:` (decide the worth classes before reading; measure value on PRs that can contain it; count what an
  author would fix, not what is true);
- `- **Applies to**: frame, research, plan, plan-review`.

### Success Criteria:

#### Automated Verification:

- `close-out.md` exists and has its pilot section:
  `test -f context/changes/advisory-review-analysis/close-out.md && grep -q '^## Dormant pilot criteria' context/changes/advisory-review-analysis/close-out.md`
  — at planning: exit 1 — expected until Phase 2.
- The research follow-up is appended:
  `grep -q '^## Follow-up Research 2026-10-19' context/changes/advisory-review-analysis/research.md` — at planning:
  exit 1 — expected until Phase 2.
- The ledger has exactly one more entry: `test "$(grep -c '^## ' context/foundation/lessons.md)" -eq 39` — at
  planning: exit 1 — expected until Phase 2 (38 entries).
- The touched Markdown is formatted:
  `npx prettier --check context/changes/advisory-review-analysis context/foundation/lessons.md` — at planning:
  exit 0.

#### Manual Verification:

- The owner reads `close-out.md`. The decision, the adopted numbers and the dormant pilot criteria match the
  decisions of 2026-10-19, and the eligibility recipe gives the stated answers for the Definitions examples —
  surface: `context/changes/advisory-review-analysis/close-out.md`.
- The owner reads the new lesson and keeps or rewords it — surface: `context/foundation/lessons.md`.

---

## Phase 3: Correct the live pointers

### Overview

Make the two live documents that describe `ai-review` say what is true: disabled since 2026-10-04, direction ended
2026-10-19. Leave the guard itself untouched.

### Changes Required:

#### 1. The workflow comments

**File**: `.github/workflows/review.yml`

**Intent**: Replace the `TEMPORARILY OFF … finder-verification measures … removes the false && line` comment
(`:23-27`), and correct the "one-command variable swap" sentence (`:218-221`). A reader of the workflow should learn
the current state and the re-entry condition without opening an archive.

**Contract**:

- Comment lines only.
- The `if:` comment states: off since 2026-10-04 (owner decision R11); direction ended 2026-10-19 (change
  `advisory-review-analysis`, see its `close-out.md`); re-entry needs a new owner decision and a new change, and
  deleting `false &&` alone is not one.
- The `:218-221` sentence keeps its historical point (the outage was not a content effect), but no longer offers a
  variable swap as the lever.
- `      false &&` stays byte-identical, and so does every non-comment line.

#### 2. The agent rules

**File**: `AGENTS.md`

**Intent**: The `AI Code Review` paragraph (`:124`) describes a running workflow. Give it its status first, so an
agent does not "fix" or rely on a job that is deliberately off.

**Contract**:

- One status sentence at the start of that paragraph: disabled with `false &&` since 2026-10-04 (R11); the search for
  a replacement finder ended 2026-10-19 (change `advisory-review-analysis`: 0 of 55 accepted glm-5.3 low findings
  were worth a fix); re-entry as in that change's `close-out.md`.
- The rest of the paragraph and the third-pass bullets stay as the description of the dormant pipeline.

### Success Criteria:

#### Automated Verification:

- Only comment lines of `review.yml` change:
  `test -z "$(git diff -U0 origin/master -- .github/workflows/review.yml | grep -E '^[-+][^-+]' | grep -vE '^[-+][[:space:]]*#')"`
  — at planning: exit 0 (no diff yet; it must stay 0 after the edit).
- The guard still holds: `grep -qxF '      false &&' .github/workflows/review.yml` — at planning: exit 0.
- The workflow still parses:
  `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/review.yml','utf8'))"` — at
  planning: exit 0.
- Both documents name the change:
  `grep -q 'advisory-review-analysis' .github/workflows/review.yml && grep -q 'advisory-review-analysis' AGENTS.md`
  — at planning: exit 1 — expected until Phase 3.
- The stale claims are gone:
  `! git grep -n -F -e 'measures a' -e 'one-command variable swap' -- .github/workflows/review.yml` — at planning:
  exit 1 — expected until Phase 3.
- Repository formatting stays clean: `npm run format:check` — at planning: exit 0.

#### Manual Verification:

- The owner reads both edits. Neither suggests that removing `false &&` is enough to bring the review back, and both
  name the change rather than a path that moves on archive — surface: `.github/workflows/review.yml`, `AGENTS.md`.

---

## Phase 4: Close the tracker issue and refresh the resume file

### Overview

Close #235 as not planned, with a comment that links the close-out. Record that in `close-out.md`, and point
`temp_steps.md` at the archive step.

### Changes Required:

#### 1. Issue #235

**File**: `context/changes/advisory-review-analysis/close-out.md` (`## Tracker`)

**Intent**: The tracker should stop implying that someone is fixing a disabled workflow's finder. The comment leaves
the repository, so it carries a permalink.

**Contract**:

- **Precondition:** Phases 1–3 are committed and the branch is pushed. Pushing is the owner's action, or needs the
  owner's explicit go.
- **Approval:** the owner approves the comment text before it is posted.
- **Command:** `gh issue close 235 --reason "not planned" --comment "<approved text>"`.
- **The comment names:**
  - the root cause and where it is recorded (`context/archive/2026-09-24-finder-serialization-outage/`);
  - the 2026-10-19 decision;
  - a permalink to `close-out.md` at the pushed commit.
- **Record:** `## Tracker` records the date, the reason and the comment URL.

#### 2. The resume file

**File**: `temp_steps.md`

**Intent**: Keep the only next-actions list true.

**Contract**:

- The 2026-10-19 resume point says the close-out is implemented and names
  `/rune-archive advisory-review-analysis` (outcome `completed`) as the next action.
- Older sections stay as history.

### Success Criteria:

#### Automated Verification:

- (paid) Close #235 as not planned with the approved comment:
  `gh issue close 235 --reason "not planned" --comment "<approved text>"` — artifact:
  `context/changes/advisory-review-analysis/close-out.md` — not run: paid.
- The issue reads closed, not planned:
  `timeout 30 gh issue view 235 --json state,stateReason --jq '.state+" "+.stateReason'` prints
  `CLOSED NOT_PLANNED` — not run: external.
- The resume file names the archive step: `grep -qF '/rune-archive advisory-review-analysis' temp_steps.md` — at
  planning: exit 1 — expected until Phase 4.
- The resume file is formatted: `npx prettier --check temp_steps.md` — at planning: exit 0.

#### Manual Verification:

- The owner approves the #235 comment text before it is posted, and later reads the posted comment and its permalink
  — surface: `context/changes/advisory-review-analysis/close-out.md`.

---

## Testing Strategy

### Unit Tests:

- No unit-test framework covers `scripts/*.py`; the repo has no Python test setup. `key-echo-check.py` is the
  regression check. It is plain Python run against the real scripts, with a synthetic key and a host that cannot
  resolve.
- **Its negative control is on record.** At planning it exits 1 on today's code: each placeholder case leaks all 8
  distinct four-character windows of the secret. The empty-key cases pass, which proves the check can tell the two
  paths apart.

### Integration Tests:

- None. Phases 2–4 change documents, comments and one tracker entry. Their checks are the greps and the YAML parse
  above.

### Manual Testing Steps:

1. Run `python3 -I context/changes/advisory-review-analysis/key-echo-check.py` after Phase 1 and read the four lines.
2. Run each script once with `SUPABASE_SERVICE_ROLE_KEY='<paste-here>'` and read the message as the maintainer would.
3. Read the `review.yml` comment and the `AGENTS.md` paragraph as an agent that has never heard of the finder
   series.

## References

- Research: `context/changes/advisory-review-analysis/research.md`
- Decisions: `context/changes/advisory-review-analysis/worth-fix-sheet.md` § Delegated owner decisions;
  `context/changes/advisory-review-analysis/change.md` § Delegated decisions
- Precedent for describing a key by shape: `scripts/prod-result-dimensions.py:64-67`
- The guard and its comment: `.github/workflows/review.yml:23-29`
- Archive naming: `.claude/skills/rune-archive/SKILL.md:15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append
> ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Stop printing the supplied key in the placeholder check

#### Automated

- [x] 1.1 The key-echo check passes for both scripts and both key-error paths
- [x] 1.2 Both scripts still parse

#### Manual

- [ ] 1.3 The diff touches only the placeholder branch and the message still guides without showing the key

### Phase 2: Record the close-out

#### Automated

- [ ] 2.1 `close-out.md` exists and has its pilot section
- [ ] 2.2 The research follow-up is appended
- [ ] 2.3 The ledger has exactly one more entry
- [ ] 2.4 The touched Markdown is formatted

#### Manual

- [ ] 2.5 The owner reads `close-out.md`: decision, numbers and pilot criteria match 2026-10-19
- [ ] 2.6 The owner reads the new lesson

### Phase 3: Correct the live pointers

#### Automated

- [ ] 3.1 Only comment lines of `review.yml` change
- [ ] 3.2 The guard still holds
- [ ] 3.3 The workflow still parses
- [ ] 3.4 Both documents name the change
- [ ] 3.5 The stale claims are gone
- [ ] 3.6 Repository formatting stays clean

#### Manual

- [ ] 3.7 The owner reads both edits: no suggestion that removing `false &&` suffices

### Phase 4: Close the tracker issue and refresh the resume file

#### Automated

- [ ] 4.1 (paid) Close #235 as not planned with the approved comment
- [ ] 4.2 The issue reads closed, not planned
- [ ] 4.3 The resume file names the archive step
- [ ] 4.4 The resume file is formatted

#### Manual

- [ ] 4.5 The owner approves the #235 comment text before posting and reads the result
