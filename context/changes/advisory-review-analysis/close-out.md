# Close-out: advisory AI review

> Change `advisory-review-analysis`. `.github/workflows/review.yml` and `AGENTS.md` point here by the change's name,
> so the pointer survives `/rune-archive`, which moves this folder to
> `context/archive/2026-10-17-advisory-review-analysis/`. Line references below are to files in this folder.

## Decision

**2026-10-19, owner-delegated to Codex: end the advisory-review work.** No paid pilot. The `ai-review` job stays
disabled by its `false &&` guard, in place since 2026-10-04 (owner decision R11). CI and `/rune-impl-review` remain
the review path. Sources: [`change.md`](change.md) § Delegated decisions — 2026-10-19;
[`worth-fix-sheet.md:175-188`](worth-fix-sheet.md) (Direction for step 4).

The owner decided four more points on the same day, during `/rune-plan` ([`change.md`](change.md) § Notes):

1. **Fix `247-I5` in this change.** Done in Phase 1, commit
   `fix(advisory-review-analysis): stop printing the supplied key in the placeholder check (p1)`. Both
   `scripts/prod-*.py` now describe a placeholder key by length only, and [`key-echo-check.py`](key-echo-check.py)
   pins it.
2. **Close #235 as not planned.** Phase 4; see [§ Tracker](#tracker).
3. **Add one lesson.** The last entry of `context/foundation/lessons.md`.
4. **Pilot eligibility is path-based, and refactors count.** See
   [§ Dormant pilot criteria](#dormant-pilot-criteria).

The owner then confirmed assumptions A1–A3 as written ([`plan.md:159-169`](plan.md)). They are the bases of
[§ What stays as it is](#what-stays-as-it-is), of the scoring rule and of the decision rule below.

## Evidence (adopted)

| What                                         | Adopted figure                                                                                                             | Source                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| glm-5.3 low, accepted findings worth a fix   | **W1 0/55**                                                                                                                | [`worth-fix-sheet.md:130-137`](worth-fix-sheet.md)                               |
| glm-5.3 low, the rest of the 55 accepted     | W2 (optional) 20/55, W3 32/55, FA 3/55                                                                                     | [`worth-fix-sheet.md:130-140`](worth-fix-sheet.md)                               |
| glm-5.3 low, distinct issues                 | 35: **0 W1**, 9 W2, 19 W3, 7 FA                                                                                            | [`worth-fix-sheet.md:130-135`](worth-fix-sheet.md)                               |
| The one W1 in the recorded material          | `247-I5`, `KEY[:24]` in both placeholder checks. Raised by glm-5.3 high and sonnet-5 low; never by glm-5.3 low             | [`worth-fix-sheet.md:109`](worth-fix-sheet.md), [`:144-151`](worth-fix-sheet.md) |
| D2 (`269-I8`), the defect the gates required | W2: a real cleanup gap in a manually run tool on a licensed corpus, with no observed trigger                               | [`worth-fix-sheet.md:152-156`](worth-fix-sheet.md)                               |
| Production glm-4.6, 2026-08-08 to 09-19      | **2 fixes** (a CI trigger filter and a stale plan checklist, neither a product bug) against **at least 37 false** findings | [`research.md:99-103`](research.md), [`:250`](research.md)                       |
| What there is to review                      | **1 of 85** PRs merged from 2026-09-01 to 2026-10-19 changed product source (#240), and it got no AI review                | [`research.md:108-109`](research.md), [`:277-288`](research.md)                  |

**What the evidence does not show.** Both gate PRs, #247 and #269, are maintainer-only tooling, so "W1 = 0" is an
honest count but a weak test of a model ([`research.md:106-111`](research.md)). The corpus does not support a verdict
that the models cannot find product bugs. The decision rests on value not being shown, with no current demand to
show it on ([`worth-fix-sheet.md:177-182`](worth-fix-sheet.md)).

## What stays as it is

Assumption A1, owner-confirmed 2026-10-19. "End the work" stops spending and experimenting; it does not dismantle a
dormant capability. Removing any of these would make a later re-entry more expensive and protects nothing while the
job is `false &&`.

- **The `ai-review` job** in `.github/workflows/review.yml`: its body and its `false &&` guard. Phase 3 changes
  comment lines only.
- **`packages/code-reviewer`**, and its `code-reviewer` CI job, which stays a required check on `master`.
- **The repository secret `OPENROUTER_API_KEY`.**
- **The repository variables** `OPENROUTER_REVIEW_MODEL=z-ai/glm-4.6` and
  `OPENROUTER_JUDGE_MODEL=anthropic/claude-sonnet-5`, as `gh variable list` showed them on 2026-10-19. Only the
  disabled job reads them.
- **The unmerged branches** `feat/finder-glm-5-3` (`ac6bbb1`) and `feat/finder-glm-5-3-high` (`0cbf03e`). They
  hold the only copies of the glm-5.3 evidence and of the two-stage finder. Neither is merged or deleted.

Also left as they are: the W2 issues in the #247 and #269 scripts (optional, [`plan.md`](plan.md) § What We're NOT
Doing), and everything under `context/archive/`.

## Re-entry

- **A new owner decision opens a new change.** That change confirms or replaces each item of
  [§ Dormant pilot criteria](#dormant-pilot-criteria) and seals them before any paid call and before any review
  output is read.
- **Deleting `false &&` alone is not a re-entry.** A PR that only lifts the guard contradicts this record, the
  `review.yml` comment and `AGENTS.md`.
- This replaces the condition the `review.yml` comment carried until this change, "the change that deploys a finder
  which passes those gates removes the `false &&` line". No finder passed those gates, and the search for one has
  ended.

## Dormant pilot criteria

> **Draft, not sealed.** It exists so that a reopening change does not start from nothing. The reopening change
> confirms or replaces each item, then seals them.

### Candidate and location

- **glm-5.3 low** (`z-ai/glm-5.3`, effort low): the only candidate the records support
  ([`research.md:119-123`](research.md)).
- **Run locally, on demand,** with the code-reviewer CLI from a worktree of `feat/finder-glm-5-3` at `ac6bbb1`,
  against each sampled PR's diff ([`research.md:331-333`](research.md);
  [`worth-fix-sheet.md:184-188`](worth-fix-sheet.md)). Nothing is merged into `master`, and `review.yml` is not
  touched.

### Eligible PRs

A merged PR is eligible when its diff changes at least one non-test file under `src/`, `supabase/functions/` or
`supabase/migrations/`. A test file is a path under `tests/` or a name matching `*.test.*` or `*.spec.*`. Refactors
count. (Owner, 2026-10-19; [`plan.md`](plan.md) § Definitions, "Eligible pilot PR".)

The recipe, run from the repository root:

```bash
N=240 # the PR to check
B=$(gh pr view "$N" --json baseRefOid --jq .baseRefOid)
H=$(gh pr view "$N" --json headRefOid --jq .headRefOid)
git cat-file -e "${H}^{commit}" 2>/dev/null || git fetch --quiet origin "pull/$N/head"
git diff --name-only --no-renames "$B...$H" -- src supabase/functions supabase/migrations |
  grep -Ev '\.(test|spec)\.[^/]+$'
```

**Eligible iff it prints at least one path.** The fetch is needed because `master` takes PRs by rebase or squash, so
a merged PR's head commit is not on `master`, and its branch is usually deleted. The root `tests/` directory is
outside the pathspec, so the filter needs only the name pattern. No `tests/` directory exists under the three roots
on 2026-10-19; if one appears, the reopening change decides whether its files count as tests.

Checked on 2026-10-19 against the Definitions examples and three merged PRs:

| Case                                                   | Stated answer | Recipe       |
| ------------------------------------------------------ | ------------- | ------------ |
| A refactor in `src/`                                   | eligible      | eligible     |
| A tests-only diff (`tests/…spec.ts`, `tests/…test.ts`) | not eligible  | not eligible |
| A root `package.json` bump                             | not eligible  | not eligible |
| A migration plus docs                                  | eligible      | eligible     |
| Only `src/**/x.test.ts`                                | not eligible  | not eligible |
| `supabase/functions/enhance/deno.json`                 | eligible      | eligible     |
| #240 (S-18 resolution disclosure)                      | eligible      | eligible     |
| #294 (toolkit pin)                                     | not eligible  | not eligible |
| #297 (skill routing and its test)                      | not eligible  | not eligible |

The six examples went through the same filter as path lists, with the pathspec matched as a path prefix. The three
PRs went through the recipe itself. #297 needed the fetch.

### Sample

The **first five eligible PRs in merge order** after the reopening change seals these criteria, with no picking.
**One review each,** on the PR's final head: after CI has finished, and after any `/rune-impl-review` of the change,
so that "already caught" can be scored.

### Classes

Copied from [`worth-fix-sheet.md:20-30`](worth-fix-sheet.md):

- **W1 fix-worthy.** A concrete defect with a plausible failure in how the code is actually used, and worth the
  author's time to fix.
- **W2 valid-minor.** True, but low impact: hardening for an unlikely edge case, a misleading message, or a docstring
  that disagrees with the code. A fix is optional.
- **W3 nit/noise.** True, but not worth the author's time: style, a speculative case, or a missing test for
  maintainer-only tooling.
- **FA false alarm.** The claim does not hold at the head, or it rests on a false premise.

Only W1 counts as worth a fix ([`worth-fix-sheet.md:126-128`](worth-fix-sheet.md)). Maintainer tooling is no
exemption: it can still have W1 defects.

### Scoring: "already caught"

- **An AI-review W1 counts only when nothing else already named the same defect:** no failed CI check on the
  reviewed head, and no `/rune-impl-review` finding of that change, whatever that finding's Decision. (Owner,
  2026-10-19.)
- A DISMISSED impl-review finding still counts as caught. A PR without a plan has no impl review, so only CI counts.
- **Whether two descriptions name the same defect is the owner's call** at classification, with the matching rule
  written down before any review is read (A2).

### Decision rule

Proposal A3. The reopening change confirms or replaces it before sealing.

- **≥ 1 W1 not already caught** in the five eligible PRs → open a change to consider re-enabling `ai-review`.
- **0** → the direction stays ended.
- FA, W2 and W3 counts and the spend are reported, but decide nothing.

### Budget and prerequisites

- **A $2 cap** for the whole pilot ([`research.md:321`](research.md);
  [`worth-fix-sheet.md:188`](worth-fix-sheet.md)). For scale: glm-5.3 low cost $0.059 on a #247-sized review and
  $0.102 on a #269-sized one ([`research.md:114`](research.md)), so five reviews would come to roughly $0.30–$0.51.
- **Raise the OpenRouter key limit first.** The recorded headroom is $0.541037
  ([`research.md:317-321`](research.md)).
- **Re-read the account credit** before the first call. The recorded figure of about $5.60 is an inference, not a
  reading ([`research.md:323-325`](research.md)).
- **The key behind the CI secret `OPENROUTER_API_KEY` is not recorded** ([`research.md:324-325`](research.md)).

### Known limits

- **n = 5, one run per PR.** That samples run-to-run variance once per PR, so the pilot cannot tell a lucky review
  from a good model ([`research.md:376-379`](research.md)).
- **Filling the sample may take months.** About one product-code PR merged in seven weeks: 1 of 85 since 2026-09-01
  ([`research.md:289-295`](research.md)).
- **The dormant runner records a technical judge failure without a judge retry line only as `exit-<n>`**
  (`pr269-06`; carried from `finder-glm-5-3-high`, [`plan.md`](plan.md) § Carried from predecessor).
- **The overlap with CI and `/rune-impl-review` is unmeasured** ([`research.md`](research.md) § Open Questions, 4).
  The scoring rule handles it by counting only W1 that neither already caught.

## Tracker

Not filled yet. Phase 4 closes #235 as not planned, after the branch is pushed, and records here the date, the reason
and the URL of the closing comment.
