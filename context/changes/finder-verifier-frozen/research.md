---
date: 2026-10-09T22:20:54+02:00
researcher: Claude (Opus 5.5) for Piotr-Miller
git_commit: cf719bca36e80342127cc837bf5edc0c1351c596
branch: feat/finder-verifier-frozen
repository: lumina-clean-ai
topic: "How the finder-verification verifier works, why its control failed, and how to run it on frozen, classified findings with D2 as the control"
tags: [research, code-reviewer, verifier, excerpts, finder, frozen-corpus, d2]
status: complete
last_updated: 2026-10-09
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Added follow-up research: sealed worktree check, #247 excerpt backcheck, stubbed dry run (all free)"
---

# Research: the existing verifier on frozen findings

**Date**: 2026-10-09T22:20:54+02:00
**Researcher**: Claude (Opus 5.5) for Piotr-Miller
**Git Commit**: `cf719bc`
**Branch**: `feat/finder-verifier-frozen`
**Repository**: lumina-clean-ai

No paid call was made. Every model-free fact below was read from git objects in this clone.

## Research Question

How does the verifier built in `finder-verification` work? It exists only on `origin/feat/finder-verification`
(`da99692`). Why did its CONTROL arm end `FAIL (G3f)`? How could it run on the frozen, already-classified findings
of `finder-failure-scenario` Phase 0, with G-D2's 8 findings as the true-positive control? What are the options for
running it?

## Summary

1. **The code exists and is frozen.** `verifier.ts`, `excerpts.ts`, the verifier prompt and `runVerificationPass`
   live only on `origin/feat/finder-verification`. Its `packages/code-reviewer/src` is byte-identical to the
   pushed tag **`finder-verification/seal`** (`9c85aa2`): `git diff --stat 9c85aa2 origin/feat/finder-verification
-- packages/code-reviewer/src` is empty. The verifier under test is therefore exactly the sealed one, with its
   recorded hashes (`context/archive/2026-10-03-finder-verification/gate.md:172-187`).
2. **No new package code is needed.** `runVerificationPass` is exported (`src/index.ts:48` on the branch). It takes
   ready findings with ids, a diff-scoped reader and a model, and it does not run the finder
   (`src/pipeline.ts:737-760`). `scripts/verifier-prompt-hash.mjs:45-87` and the archived
   `backcheck-269-policy.mjs:37-69` already rebuild the frozen #269 findings, reader and excerpt plan without a
   model. A frozen harness is those two scripts plus the one paid call.
3. **The CONTROL failure says almost nothing about the verifier's judgement.** G3f failed on the React fixture's
   stale closure. In 2 of 3 rows the finder never raised it, and in the third the verifier withheld a **compound**
   finding as `unsupported` because one half depended on code it was not shown (`gate.md:717-728`). The verifier
   was never measured on #269, #240 or any owner-classified finding.
4. **The verifier answers "is the claim true of this code?", not "should this be reported?"** That is its own
   instruction (`src/prompts.ts:490-502`, quoted below). The owner's 21 rejections split accordingly:
   - **5 are refutable from the code alone:** G-D13, G-D14, G-D20, H-R4, arguably G-D12.
   - **About 3 need code the verifier cannot see:** Pillow internals (G-D1, G-D15) and in-code algebra whose
     evidence lies outside the excerpt windows (G-D17).
   - **About 4 need context outside the code:** input formats, benchmark ROIs and grants (G-D3, G-D11, partly
     H-R2, partly G-D12).
   - **About 9–13 are accurate claims rejected on severity or policy:** missing tests for maintainer-only tooling
     (D4–D8), message-only complaints (D9, D10, D16, D18, D19). A **correct** verifier should _confirm_ these.

   So the verifier, working as designed, cannot bring the sealed gate's "zero owner-rejected" to zero. The
   experiment has to score per class, not as one pass/fail number.

5. **The D2 control is structurally handicapped by the excerpt policy.** D2's evidence is 30 lines of
   `bread-spike.ts` (79, 91–96, 189–195, 198–213). None of the 8 G-D2 findings is served both halves:
   - 7 receive `localInput` (167–196) but none of `deleteUpload` (198–213), so 14 of 30 lines;
   - 1 (finding 4.2) receives `deleteUpload` but not the upload path, so 22 of 30.

   This was known and accepted at the seal (`gate.md:264-269`). An `unsupported` on D2 would therefore not show
   whether the model or the excerpt policy failed, unless the experiment separates the two (§ Options, arm O).

6. **The corpus can be rebuilt fully from local data.** All three sources resolve:
   - E: `086a364:…/finder-sonnet-effort/gate-effort-runs.jsonl`;
   - G: `573ee33:…/finder-model-swap/gate-openai-pr269.jsonl`;
   - H: `master:…/finder-sonnet/gate-sonnet-runs.jsonl`.

   PR #285 (`e09f63a`) also put the archives on this branch. Both PR heads are present (`fca2778`, `dec09f8`), and
   clean detached worktrees exist in `~/.cache/finder-sonnet-gate/wt-{269,247}`. Both frozen diffs hash to the
   recorded sha256 (`21973af3…`, `1e4ec088…`).

## Detailed Findings

### 1. The verifier (`origin/feat/finder-verification`, line numbers as there)

**Call shape:**

- `createVerifier(options)` (`src/verifier.ts:153`) → `verify(input, {abortSignal, timeoutMs})` (`:183`).
- **One request carries all of a review's findings**, not one per finding (`src/pipeline.ts:870-885`). It sends
  `{findings: sent, blocks: plan.blocks, perFinding}`, and every finding's blocks go into the one prompt. The quote
  check, however, searches only that finding's own blocks (`src/verifier.ts:353`).

**Request:**

- model from `--verifier-model` → `OPENROUTER_VERIFIER_MODEL` → `DEFAULT_VERIFIER_MODEL = "openai/gpt-6-luna"`
  (`src/config.ts:259`);
- `reasoning: {enabled: false}` (R7);
- `require_parameters: true`, `only`/`order` from `OPENROUTER_VERIFIER_PROVIDERS`;
- no `response_format`, SDK retries 0;
- 120 s timeout covering the call and the repair (`DEFAULT_VERIFIER_TIMEOUT_MS`, `src/pipeline.ts:90`);
- the pipeline's `withOneRetry`, and one format repair (`src/verifier.ts:193-216`).

**Wire output:** `{verdicts: [{id, verdict: confirmed|refuted|unsupported, quote, reason}]}`. `unverifiable` is
never on the wire; only code assigns it.

**Publication** (`applyVerdicts`, `src/verifier.ts:307-386`):

- Only `confirmed` with a passing quote is published. A passing quote is ≥ `MIN_QUOTE_CHARS = 10` non-whitespace
  characters (`:230`) and an exact or whitespace-collapsed substring of one of that finding's own blocks (`:267-275`).
- `confirmed` with a failing quote becomes `unverifiable: quote-not-in-excerpt`.
- Planner refusals become `no-locator`, `source-refused`, `excerpt-over-limit` or `review-budget`.
- Zero verdicts become `no-verdict`; more than one, `duplicate-verdict`.

**Granularity:** one verdict per finding, and the whole `description` is the claim (`src/prompts.ts:537`). A
compound finding with one unprovable half is withheld whole (F-b).

**Instructions** (`src/prompts.ts:490-502`), the sentences that decide the classes above:

> confirmed: the excerpts show the defect the finding describes — quote the lines that show it. refuted: the
> excerpts contradict the claim — quote the lines that contradict it. unsupported: the excerpts do not settle the
> claim, for example because it depends on a library's behaviour or on code in a file you were not given — leave
> the quote empty and say what is missing.

> You are not judging severity, wording, or whether the fix is good — only whether the described defect is really
> present in the code shown.

The prompt (`src/prompts.ts:528-550`) sends `{id, file, startLine, endLine, category, claim, blocks}`. Severity and
suggestion are deliberately withheld. The verifier never sees the diff.

### 2. What the verifier sees: `src/excerpts.ts`

The planner is deterministic and pure; its limits are sealed (`EXCERPT_LIMITS`, `:25-54`). Per finding it delivers:

- **E1:** the file header, up to 40 lines before the first unit.
- **E2:** the enclosing top-level unit.
  - Whole if ≤ 80 lines, otherwise ±30 lines around the cited span.
  - Otherwise up to 2 backticked same-file identifiers; failing those, a ±25-line window (`:401-448`).
  - A cited span over 60 lines is treated as file-level.
- **E3:** up to 2 same-file call sites, ±20 lines each (`:371-388`).
- **E4:** up to 2 backticked identifiers naming a unit in another diff file, first 40 lines each (`:456-463`).

**Caps:**

- 220 lines / 16,000 chars per finding, else `excerpt-over-limit`; never truncated.
- 60,000 chars and 25 findings per review, else `review-budget` (`:577-605`).
- Directory claims get `no-locator`.

**Backcheck on #269** (`context/archive/2026-10-03-finder-verification/backcheck-269-policy.json`;
`gate.md:240-269`):

- Rows: 9 of 20 fully served, 8 partly, 2 not (D8, D17), 1 with no locator (D5).
- Findings: 12 of 38 full, 21 partly, 2 not, 3 with no locator.
- No finding reached a limit; the largest was 125 lines / 7,054 chars.
- **There is no backcheck for #247**, so sets H and E are unknown.

### 3. Running it without the finder

- **Exported seam** (`src/index.ts` on the branch): `runVerificationPass`, `planExcerpts`, `readDiffScoped`,
  `parseDiffPaths`, `assignFindingIds`, `mergeFindings`, `createVerifier`, `applyVerdicts`. No CLI flag or stage
  reads findings from a file, and the gate runner always runs the finder (`scripts/finder-gate-core.mjs:65-77`).
  A small script is the route.
- **Minimal harness** (from the analysis of `verifier-prompt-hash.mjs:45-87` and `runVerificationPass`):

  ```js
  const findings = assignFindingIds(batch); // or assignFindingIds(mergeFindings(batch)), see the ids decision
  const reader = readDiffScoped({ allowedPaths: parseDiffPaths(diff), root, readFile, realpath, isRegularFile });
  const pass = await runVerificationPass({
    findings,
    reader,
    requireVerification: true,
    model,
    createVerifier: (o) =>
      createVerifier({
        ...o,
        providerRouting: { order: [slug], only: [slug], allow_fallbacks: true, require_parameters: true },
      }),
  });
  // pass.published, pass.verification.verdicts, pass.verifierTelemetry
  ```

- **Ids:**
  - `assignFindingIds` numbers by input position (`F1…`, `scorecard.ts:24`).
  - `mergeFindings` dedups by key and category and re-sorts by file, line and category (`findings.ts:86`).
  - Frozen ids therefore change through the merge, and duplicate members of one row would collapse. The harness
    must keep its own map from frozen member id (`phase0-findings.json` `member`, e.g. `openai-pr269-01#1.2`) to
    the assigned id.
- **Offline dry run:** inject `verifier: VerifyFn`, or `createVerifier({fetch: openRouterStub(...).fetch})`
  (`src/openrouter-stub.ts:71`, test-only). Either way the harness can be proven end to end before a paid call.
- **Tests on the branch:** `verifier.test.ts` 27, `excerpts.test.ts` 39, `pipeline.test.ts` 97 (by grep, not run).
  The close-out recorded 1,086 package tests passing at `bdfaf20` (`gate.md:765-767`). All of them are offline.
- **Nothing to replay:** `gate-control-promptfoo.jsonl` keeps verifier cost, providers and status per row, but no
  verdict strings. The only verdict detail is the prose at `gate.md:717-728`.

### 4. The frozen corpus (`context/archive/2026-10-09-finder-failure-scenario/`)

**`phase0-findings.json`:** 75 records with `set`, `row`, `member`, `pr`, `owner`, `ownerBasis`, `delegated`,
`L`, `Lwhy`, `finding`.

- `finding` is the finder's output verbatim: `file`, `startLine`, `endLine`, `severity`, `category`,
  `description`, `suggestion`, plus `id` in E and H only.
- There is no `title` field; the finder schema has none.
- 11 G findings lack `endLine`. 3 G findings (G-D5) and 1 E finding lack `startLine`, so they become `no-locator`.
- **For G, raw = published:** the 38 are the attempts' own `findings` arrays (5, 1, 3, 5, 4, 3, 4, 3, 6, 4). No
  earlier layer was stored.

**Owner-classified rows (25)**, with what a code-reading verifier can do:

| Class (owner basis)                                  | Rows                                   | Correct verifier outcome                                                                                  |
| ---------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Real**                                             | G-D2 (8 members), H-R1, H-R3, H-R5     | `confirmed` (H-R1 is a documentation claim; H-R5's real line is :102, cited :100)                         |
| Code contradicts the claim, refutable from repo code | G-D13, G-D14, G-D20, H-R4              | `refuted`                                                                                                 |
| Code contradicts the claim, but needs library source | G-D1 (4), G-D15                        | `unsupported` at best (Pillow 12.3.0 `draft()` is not in the repo)                                        |
| Cannot occur with the harness's inputs               | G-D3 (5), G-D11, G-D17                 | `unsupported` (the facts are outside the code; D17's in-code evidence is not served)                      |
| Documented, deliberate method                        | G-D12                                  | arguably `refuted` (the docstring at 37–41 is in the code); a comment is not evidence by the instructions |
| Missing tests for maintainer-only tooling (policy)   | G-D4 (3), G-D5 (3), G-D6, G-D7, G-D8   | `confirmed` is _accurate_; G-D5 is `no-locator`                                                           |
| Only a friendlier or earlier message missing         | G-D9, G-D10, G-D16, G-D18, G-D19, H-R2 | `confirmed` is mostly _accurate_; G-D19 needs `harness.ts:43-51`                                          |

**Set E** (26 rows, 32 findings: #247 15 rows / 17 findings, #269 11 / 15):

- **No owner classification,** and its delegated labels contradict the owner's missing-tests precedent
  (`phase0.md:203-210`). E can be scored only descriptively.
- Two consistency pairs exist: E-R247-01 ≈ H-R1 (real) and E-R247-13 ≈ H-R4 (rejected).
- No E finding is a D2 member.

### 5. Why CONTROL failed, and what that leaves open

- **G2:** passed 5/5. The verifier was never called, since there were 0 findings.
- **G3f** failed on React only: `issue_recall` 0/3, `flaw_stale_closure` 0/3, `flaw_lost_cleanup` 2/3.
  - In rows 1 and 3 the finder did not raise the stale closure, a loss **before** verification.
  - In row 2, F1 bundled the stale closure (confirmable) with a cleanup claim depending on
    `metricsClient.subscribe`, and the verifier returned `unsupported`. That is the one loss caused by
    verification (`gate.md:717-728`).
- **MAIN** (sonnet-5 verifier) was declined (`gate.md:740-750`): it cannot fix a finder miss, and its $2.25
  pessimistic total did not fit $2.00.
- **Never measured:** any verifier verdict on #269/#240 findings, any refutation of a false claim, any
  confirmation of D2.
- **Follow-ups** (`context/archive/2026-10-03-finder-verification/follow-ups/successor.md`):
  - F-a: finder recall variance. Out of scope here, since the findings are frozen.
  - F-b: compound findings. Three options, none decided: split before verifying, verify per claim, or have the
    finder emit one claim per finding (`:31-32`). Phase 0 says this must be decided before measuring
    (`phase0.md:383-384`).

## Options for running it

| Option                                                                         | What it takes                                                                                                                                                                                         | For                                                                                                                                                            | Against                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Worktree at `finder-verification/seal` + a harness script** (recommended) | `git worktree add <scratch>/fv-seal finder-verification/seal`, `npm ci` in its `packages/code-reviewer`, then a harness `.mjs` (kept in this change folder) run with `tsx` against that tree's `src/` | Measures exactly the sealed code (hashes in `gate.md` §1 can be re-checked before the run); no port, no production change; an immutable tag, not a branch head | The harness imports another tree's code, so its path and commit must be pinned in the pre-registration; a new pipeline flag or CLI would still not exist on `master` |
| B. Port the verifier into this branch                                          | ~1,400 non-test lines (`excerpts.ts`, `verifier.ts`, verifier schemas and prompt, `readDiffScoped`, `provider-metadata.ts`, routing helpers) plus pieces of `finder-serialization-outage`             | Code would live where the result is recorded                                                                                                                   | Production-shaped work before the verifier has shown it is worth anything; changes the code hashes, so "the sealed verifier" stops being what is measured            |
| C. Merge `origin/feat/finder-verification`                                     | `git merge-tree` reports no conflicts                                                                                                                                                                 | Cheapest mechanically                                                                                                                                          | Drags in the two-stage finder and 49 commits; `finder-failure-scenario` put "merging any predecessor branch" out of scope (`change.md:111-114`)                      |

Within option A, the plan has to pre-register these choices:

1. **Batching:**
   - **Per original run/attempt** reproduces production: one request, shared blocks, the per-review caps. That
     makes 19 batches: 10 G attempts, 1 H run, 8 E runs.
   - **Per finding** isolates each verdict from its neighbours' excerpts.
   - Per run is the faithful default. Per finding is a diagnostic.
2. **Ids:** `assignFindingIds` alone keeps each attempt's members distinct. `mergeFindings` is what production
   does, but it can collapse members that the scoring counts separately.
3. **Arm O ("oracle excerpts", diagnostic):** the same model on the same findings, with the owner-evidence lines
   (`backcheck-269.py` / `backcheck-269-policy.mjs` `EVID`) added as blocks. It separates "the model cannot judge"
   from "the policy did not deliver the evidence", which matters most for D2. It does not test the production
   policy.
4. **F-b handling:** whether a compound member is scored whole (production behaviour) or split. Splitting needs a
   human-written split, which is itself a new input to freeze.
5. **Model(s):**
   - CONTROL luna (`openai/gpt-6-luna` @ `openai`) is the sealed default.
   - sonnet-5 is the declined MAIN.
   - Prices last read 2026-10-04/05 ($0.10/$0.50 and $2/$10 per M) must be re-read live.
6. **Repeats:** a single draw per batch cannot separate model variance from judgement. At least 3 per batch, per
   F-a's lesson.

**Cost:** a rough estimate, not a measurement. It comes from the sealed per-attempt verifier figures for #269
(`gate.md:515`: CONTROL est. $0.0009 / P $0.0019, MAIN est. $0.0179 / P $0.0382).

| Arm               | Per batch (pessimistic) | 19 batches × 3 repeats |
| ----------------- | ----------------------- | ---------------------- |
| luna, per run     | ≈ $0.002                | ≈ $0.11                |
| sonnet-5, per run | ≈ $0.04                 | ≈ $2.2                 |

Per-finding batching multiplies the instruction overhead about 4×. The last settled key counter was $54.560493 of
$60 (2026-10-07T20:51:51Z, `context/archive/2026-10-06-finder-sonnet-effort/gate.md:515-518`), about $5.44 left. It
must be re-read before T0.

## Code References

All line numbers below are on `origin/feat/finder-verification` unless they are under `context/` or `.github/`.

- `packages/code-reviewer/src/verifier.ts:153,183` — `createVerifier` / `verify`
- `packages/code-reviewer/src/verifier.ts:193-216` — the one format repair
- `packages/code-reviewer/src/verifier.ts:230,267-275,307-386` — quote floor, quote check, `applyVerdicts`
- `packages/code-reviewer/src/excerpts.ts:25-54,280,371-463,577-605` — limits, unit grammar, E1–E4, caps
- `packages/code-reviewer/src/prompts.ts:490-502,528-550` — verifier instructions and prompt
- `packages/code-reviewer/src/pipeline.ts:90,737-760,780-898` — timeout, `VerificationPassInput`, `runVerificationPass`
- `packages/code-reviewer/src/index.ts:21,48,76,84` — the exported seam
- `packages/code-reviewer/src/openrouter-stub.ts:71` — offline stub
- `packages/code-reviewer/scripts/verifier-prompt-hash.mjs:45-87` — frozen #269 findings → reader → excerpt plan, no model
- `packages/code-reviewer/scripts/finder-gate-core.mjs:65-77` — gate stages, always with the finder
- `context/archive/2026-10-03-finder-verification/backcheck-269-policy.mjs:37-69` — the same, plus the owner evidence lines per D-row
- `context/archive/2026-10-03-finder-verification/gate.md:240-269,717-750` — excerpt backcheck, CONTROL failure, MAIN declined
- `context/archive/2026-10-09-finder-failure-scenario/phase0-findings.json` — the 75 frozen findings with dispositions
- `.github/workflows/review.yml:29` (this branch) — `false &&`: `ai-review` still off on `master`

## Architecture Insights

- **The verifier is a truth check, not a reportability check.** Its instructions exclude severity and the value of
  the fix. Everything the owner rejected on policy (maintainer-only tooling, message-only) is outside what it can
  remove by design. A second, separate bar for that already exists as cheap prompt guidance (`phase0.md:330-332`).
  Mixing the two would make any score uninterpretable.
- **Evidence delivery and judgement are coupled.** The verifier can only quote what the planner served, so a
  `unsupported` is ambiguous between "the model is cautious" and "the policy missed the lines". D2 sits exactly on
  that line. Arm O is the cheapest way to uncouple them without changing the sealed policy.
- **Production shares context across findings.** All of a review's blocks travel in one prompt. A frozen run that
  regroups findings differently from their original attempt measures a slightly different system.

## Historical Context (from prior changes)

- `context/archive/2026-10-03-finder-verification/change.md:80-117` — R1–R13. R5 publication, R6 fixed excerpt
  limits (E5 dropped: an absence claim cannot be confirmed by quoting what is present), R7 no reasoning, R8 no
  source root. Phase 1 #5: the verifier sees `description` only.
- `context/archive/2026-10-03-finder-verification/gate.md:264-269` — D2 partly served, accepted knowingly; "G3h on
  #269 may see N = 0".
- `context/archive/2026-10-03-finder-verification/follow-ups/successor.md` — F-a, F-b.
- `context/archive/2026-10-09-finder-failure-scenario/phase0.md:319-332,357-386` — the recommendation that led
  here, and the owner's next-experiment direction.
- `context/archive/2026-10-09-finder-failure-scenario/change.md:31-35,104-114` — the gate is unchanged; a paid
  phase needs its own approval and pre-registration. Out of scope there: re-enabling `ai-review`, changing the
  gate, merging a predecessor branch.
- `context/archive/2026-10-05-finder-sonnet/` and `context/archive/2026-10-06-finder-sonnet-effort/` — both ran
  **without** the verifier and without the two-stage finder (branched from `master` `4c3fc87`).
- **Lesson applied** (1 of 38 ledger entries applies to research): "A fixture that fails to reproduce a live
  defect is evidence about the fixture — ablate from the artifact that reproduces". Here the reproducing artifacts
  are the real frozen findings. That argues against judging the verifier on new synthetic fixtures, and for arm
  O-style ablation of the excerpt policy on real findings.

## Related Research

- `context/archive/2026-10-03-finder-verification/research.md` — the verifier's original design research (excerpt
  windows, where deciding lines sit, `:336-356`).
- `context/archive/2026-10-09-finder-failure-scenario/phase0.md` — the frozen corpus and its row-level grades.
- `harness.mjs` (this folder) — the frozen-findings harness against the sealed worktree; modes `plan` and
  `dry-run`, both free. No paid mode yet.
- `harness-plan-check.json` (this folder) — `plan` output: excerpt serving per finding, base and arm O.

## Open Questions

1. **F-b (owner):** score compound findings whole, as production does, or split them by hand before verifying?
2. **What counts as success, per class (owner, pre-registration).** Suggested shape:
   - D2's 8 and the 3 other real rows not removed;
   - the 4 code-refutable rejections refuted;
   - policy-rejected rows reported as a separate, expected-`confirmed` class rather than as failures.

   Should the sealed "zero owner-rejected" gate be cited at all, given the verifier cannot meet it by design?

3. **#247 excerpt serving is unknown:** a free backcheck at `dec09f8`, like `backcheck-269-policy.mjs`, would show
   how much H's and E's evidence the policy serves.
4. **Is `runVerificationPass` clean outside the pipeline?** Expected yes, since the tests inject it. Not executed
   yet; a stubbed dry run settles it for free.
5. **Current OpenRouter credit and prices:** not read live (no network calls in this research).
6. **Set E:** use it descriptively, or does the owner want to classify its 26 rows first, so that it becomes
   ground truth?

## Follow-up Research 2026-10-09T23:10+02:00

Run after the owner decisions recorded in `change.md` § Owner decisions (after `research.md`). Everything here is
free: git, files and a stubbed HTTP client. No network call was made.

### Sealed worktree (option A)

- `git worktree add --detach <scratch>/fv-seal finder-verification/seal`, giving `HEAD` `9c85aa2` and
  `packages/code-reviewer/src` tree `9be94235…`.
- `npm ci` ran in the worktree's package.
- `scripts/verifier-prompt-hash.mjs` reproduces all six sealed hashes of `gate.md` §1:
  `c27d78e6`, `9f1093c7`, `8dfdda7e`, `aa8bf887`, `a045da98`, `757f3492`.
- `npm test` passes 29 files / **1,086 tests**, the same count as the close-out at `bdfaf20`.

### Harness (`harness.mjs`)

**Refusal checks.** The harness refuses to run unless all of these hold:

- the worktree is at the seal commit;
- its `src` tree is the sealed one, with no uncommitted change;
- `phase0-findings.json` hashes to `46aaa0f2…0740`;
- both PR diffs rebuild to their recorded sha256.

**Batching.** One batch per original run or attempt: 19 batches, 75 findings. Each batch goes through
`mergeFindings` → `assignFindingIds`, as production does. No member collapsed in any batch.

**Base arm.** It calls the sealed `runVerificationPass` unchanged.

**Arm O.** The base plan, untouched, plus one extra block per contiguous run of the finding's evidence lines that
its own blocks lack. The block is rendered byte-identically to `excerpts.ts` `renderRange`. Verification then runs
the same step 3 (`createVerifier` → `withOneRetry(verify)` → `applyVerdicts`) on the augmented plan.

**Evidence lines:**

- **G rows:** the archived EVID of `backcheck-269.py`, ported verbatim.
- **H rows: proposed by the agent** from the owner's reasons and the pre-sort in
  `context/archive/2026-10-05-finder-sonnet/hand-read-247.md`. **Not approved yet:**

  | Row  | Proposed evidence                                                |
  | ---- | ---------------------------------------------------------------- |
  | H-R1 | `prod-fetch-results.py` 16–17, 38                                |
  | H-R2 | `prod-fetch-results.py` 47–56; `prod-result-dimensions.py` 62–67 |
  | H-R3 | `prod-fetch-results.py` 68, 90–93                                |
  | H-R4 | `prod-result-dimensions.py` 79–96, 125–127                       |
  | H-R5 | `prod-result-dimensions.py` 102, 109, 139                        |

- **E rows:** none, since E is descriptive. For E, O equals base.

### Validation against the sealed backcheck

For all 38 G findings, the harness's base plan equals the archived `backcheck-269-policy.json`: the same state,
the same served/total evidence lines and the same block ranges. That is **0 mismatches**, so the harness
reproduces the sealed policy exactly.

### #247 excerpt backcheck (new, never run before)

`harness-plan-check.json`. Base arm, with the proposed evidence for H:

- H-R1 3/3, H-R3 5/5;
- H-R4 19/21: the loop guard at `:86` is served, but `:126-127` (the `None` → "header not recognised" path) is
  not;
- H-R5 2/3 (`:139`, the `CONFIRMED` line, missing);
- H-R2 10/16: the sibling's checks in the other file are not served.

**#247 is served much better than #269**, and no #247 finding is unverifiable.

### Serving by scoring class (findings; "full" = every evidence line served)

| Class                                         | Findings |              Base: full | O: full | Unverifiable (both arms) |
| --------------------------------------------- | -------: | ----------------------: | ------: | -----------------------: |
| True (G-D2 ×8, H-R1, H-R3, H-R5)              |       11 |                       2 |      11 |                        0 |
| False, code-refutable (G-D13, D14, D20, H-R4) |        4 |                       3 |       4 |                        0 |
| Policy                                        |       15 |                       4 |      12 |   3 (G-D5, `no-locator`) |
| Ambiguous                                     |       13 |                       5 |      13 |                        0 |
| Descriptive (E)                               |       32 | — (no evidence defined) |       — |                        0 |

- **D2:** base serves 14/30 lines to 7 members and 22/30 to member 4.2, exactly as sealed. O serves 30/30 to all 8.
- **The code-refutable class is nearly fully served in base already** (only H-R4 misses 2 lines). There, base
  measures the model's judgement, not evidence delivery.

### Stubbed dry run (`harness.mjs dry-run`)

- The real `createVerifier` ran with the package's `openRouterStub` as `fetch`, and no API key was in the
  environment.
- **38 requests** (19 batches × 2 arms), each checked on the wire: model `openai/gpt-6-luna`,
  `reasoning: {enabled: false}`, routing `{order, only: ["openai"], allow_fallbacks: true,
require_parameters: true}`, no `response_format`, no `tools`.
- The stub walked every publication branch across both arms, and **every outcome matched: 0 failures.**

  | Stub answer                                     | Outcome        | Findings |
  | ----------------------------------------------- | -------------- | -------: |
  | `confirmed` with a valid quote                  | `published`    |       46 |
  | `refuted`                                       | `refuted`      |       40 |
  | `unsupported`                                   | `unsupported`  |       36 |
  | `confirmed` with a quote absent from the blocks | `unverifiable` |       22 |
  | not sent (G-D5)                                 | `unverifiable` |        6 |

  Every record maps back to its frozen member id.

- **Measured verifier input**, i.e. the request's message characters: base 375,945 in total (max 27,957 per
  batch), O 392,114 (max 30,515). The instructions are 2,786 chars, matching the sealed figure.
- The output stayed in scratch (`harness-dry-run.json`); it holds stub verdicts only and is not evidence.

### Cost projection (from the measured input, at the last-read luna price $0.10 / $0.50 per M)

| Input      | Estimate                                                     | Pessimistic                                                            |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Basis      | chars ÷ 3.5; 60 output tokens per sent finding               | chars ÷ 3.0 × 1.16; 120 output tokens per finding, doubled by a repair |
| Per repeat | 768k chars → about 220k input + 9k output tokens ≈ **$0.03** | about 297k input + 35k output tokens ≈ **$0.05**                       |

Both arms × 3 repeats: **≈ $0.08 estimated, ≈ $0.15 pessimistic.** _(2026-10-10: the "pessimistic" figure is an estimate, not a bound. The cap rests on the per-request gate, under its stated assumptions A1–A3. The attempt reserve P ($0.053–0.058) only decides whether to start an attempt. See `plan.md` § Definitions, Request gate, P and Cap.)_ Prices and credit must be re-read live before
T0.

### Answered open questions

- **Q4 — yes.** `runVerificationPass` runs cleanly outside the pipeline on frozen findings.
- **Q3 — answered.** The #247 backcheck is above.

### Still open

- **Owner:** approve or correct the proposed H evidence lines.
- **Owner:** confirm the G EVID as arm O's frozen evidence.
- **Owner:** confirm the class assignment the harness uses (`CLASS` in `harness.mjs`). In particular "ambiguous"
  = G-D1, D3, D11, D12, D15, D17.

### Update after owner decisions 7–8 (2026-10-09)

- **Evidence:** the H evidence lines are corrected and approved (see `change.md` decision 7), and the
  `PROPOSED` marking is removed from the harness.
- **Re-run on the corrected set (base / O):** H-R1 25/25 / 25/25; H-R3 5/5 / 5/5; H-R5 2/4 / 4/4 (base misses
  `:138-139`); H-R4 30/33 / 33/33; H-R2 10/16 / 16/16. D2 is unchanged: 7 × 14/30 and 1 × 22/30 in base, 30/30
  in O.
- **Classes are final** (decision 8): true 11 findings, code-refutable 3, ambiguous 14, policy 15, descriptive 32.
  - Base full-evidence counts: true 2/11, code-refutable **3/3**, ambiguous 5/14, policy 4/15 (3 `no-locator`).
  - The code-refutable class therefore tests model judgement directly, in base, with every listed line served.
- **Dry run re-run:** 38 requests, 0 failures. O's input is now 392,176 chars. The cost projection is unchanged.
