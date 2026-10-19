# temp_steps.md — immediate next steps

> Refreshed 2026-10-19 (`advisory-review-analysis`: close-out implemented; #235 closed as not planned; archive next).
> Previously 2026-10-14 (finder-glm-5-3: Phases 1–3 implemented, Phase 4 next), 2026-10-11 (Phases 1–2 implemented, Phase 2 awaiting review), 2026-10-05 (finder-verification measured, decided and archived: none admitted), 2026-10-04 (sealed after Phases 0–3) and 2026-10-03 (after #274; finder-model-swap archived; finder-verification opened and researched). **Short-lived by design**: this is the next-few-actions
> list and the **only** such list. `context/foundation/roadmap.md` stays authoritative for scope,
> including parked work. Delete this file once the list is empty.

## Resume point — session of 2026-10-19 (`advisory-review-analysis`: close-out implemented; archive next)

**Branch:** `chore/advisory-review-analysis`. Phases 1–3 are committed and pushed through `82776c5`, verified on
`origin`. Their phase reviews are APPROVED. No paid model evaluation ran; `ai-review` stays disabled.

**The close-out is implemented.** [#235 is closed as not planned](https://github.com/Piotr-Miller/lumina-clean-ai/issues/235).
The [closing comment](https://github.com/Piotr-Miller/lumina-clean-ai/issues/235#issuecomment-6276864332), posted by
Piotr-Miller on 2026-10-19, exactly matches `context/changes/advisory-review-analysis/issue-235-comment.md`.
Its root-cause and close-out links were verified at pushed commit `82776c5`. The date, reason and comment URL
are recorded in `close-out.md` § Tracker. On resume, the agent found the issue already closed and made no
duplicate GitHub mutation. The Phase 4 and epilogue commits are local; this run made no push.

**Next action:** `/rune-archive advisory-review-analysis`, outcome `completed`, after any requested final
implementation review. A new owner decision and change are required for any pilot.

**Human acceptance: 0 of 5 recorded.** Rows 1.3, 2.5, 2.6, 3.7 and 4.5 remain pending. The earlier agent reviews
do not record human acceptance; 4.5 also requires the owner to read the posted comment and its permalink.
These checks do not block implementation or archive with outcome `completed`.

---

## Resume point — session of 2026-10-19 (`advisory-review-analysis`: research and decisions complete; superseded)

On `chore/advisory-review-analysis`, research and the owner-delegated decisions are written but **uncommitted**:
`change.md`, `research.md`, `worth-fix-sheet.md` and this resume file. Their hashes are in
`.git/rune/advisory-review-analysis.carry`. AI review is still off on `master`. No paid evaluation ran.

The owner asked Codex to fill **Owner**, decide whether W2 counts and select the pilot direction. Decisions:

- Only W1 counts: **0/55** accepted glm-5.3 low findings. Optional W2: **20/55**, with `269-I12` moved to W3
  because both rounding rules agree on all 18 frozen inputs.
- `247-I5` (`KEY[:24]`) is W1, raised by other candidates; D2 stays W2. The three disputed accepts are FA.
- **End the work; no paid pilot now.** `/rune-plan` should formalize close-out and carry the key-printing fix as a
  concrete follow-up. If a later decision reopens a pilot: five new product-behaviour-changing PRs, glm-5.3 low,
  locally from a `feat/finder-glm-5-3` worktree; count only W1 not already caught by CI or `/rune-impl-review`.

Detailed rationale: `context/changes/advisory-review-analysis/worth-fix-sheet.md`, Delegated owner decisions.

**Change `finder-glm-5-3-high` is archived** at `context/archive/2026-10-16-finder-glm-5-3-high/` (outcome
`completed`; archive commit `6d5a09a`, sync record `0cbf03e`, `sync: none`).

- **Result: not admitted (screening).** `STOP (c: cost)` after the single #247 run `s247-01`, under the rules
  pushed before any spend: 53·m247 = $7.417286 > $7.404940, on the #247 part alone, before the 8·m269 term. #269
  and D2 were not measured. Screening spend T_s $0.208963 of the $0.75 cap. Fixtures passed every informational
  metric.
- **Full implementation review:** APPROVED at `7dcb3e7`. Its one observation F1 (a symlink got past the sheet's
  dry-run write guard) is fixed in `2ffe24b`: 10 new tests, 9 of them red before the fix; package 1,207/1,207.
- **PR #295 closed unmerged**, with a comment. Branch `feat/finder-glm-5-3-high` = `0cbf03e` on `origin`. The gate
  tooling stays off `master` on purpose. F1 has nothing to land on there: `master` has no `glm-gate-*` file.
- **Owner's corrections (2026-10-17):**
  - The failed gates were not only the D2 threshold: luna had 19 of 20 distinct #269 findings rejected.
  - "Missed by $0.012" understates it: the stop fired on the #247 term alone.
  - The old STOP stands. New criteria apply to fresh cases.

**Keep both branches. They hold the only copies of the glm-5.3 evidence. Neither is merged, so their SHAs are
stable.**

- `feat/finder-glm-5-3` = `ac6bbb1`: archive `context/archive/2026-10-11-finder-glm-5-3/`, NOT ADMITTED (hand-read).
- `feat/finder-glm-5-3-high` = `0cbf03e`.

**Change `advisory-review-analysis`** (status `preparing`):

- **Branch:** `chore/advisory-review-analysis`, from `origin/master` `b517e54`. Upstream is set to its own remote
  branch, never `master`.
- **Scope:**
  - **$0 for new model calls.**
  - From the recorded results, count concrete bugs worth a fix, false alarms, duplicates and minor remarks.
  - **Output:** a recommendation of one candidate, or of ending the work, plus proposed criteria for a possible
    on-demand pilot.
  - D2 becomes a reported weakness, not a veto.
- **Main question:** glm-5.3 low.
  - Recorded results: the owner accepted 55 of 60 published findings (#247 12; #269 42 + D2; 5 rejected). D2 was
    found in 1 of 9 valid #269 runs. Provisional cost $6.556540/month.
  - Source: `git show origin/feat/finder-glm-5-3:context/archive/2026-10-11-finder-glm-5-3/gate.md`, § Hand-read and
    line 609.
  - **How many accepted findings actually justified a fix?** 55/60 accepted does not settle that.
- **Budget context:** the OpenRouter key limit is $59.936398, and about $5.60 of account credit is left.

**Next actions, in order:**

1. **Done 2026-10-19:** research from the recorded evidence, with no paid model calls.
2. **Done 2026-10-19:** proposed classifications in `research.md` and `worth-fix-sheet.md`.
3. **Done 2026-10-19, delegated by the owner to Codex:** all 41 Owner cells filled; threshold and pilot direction
   recorded in the sheet. The adopted W2 count is 20/55; the original proposal was 21/55.
4. **Agent:** `/rune-plan advisory-review-analysis` to formalize ending the work, keep `ai-review` off and carry
   `247-I5` as a concrete follow-up. Include dormant pilot criteria only as a fallback for a later decision.
5. **Direction selected:** end the work without a paid pilot. A later paid pilot would be a new decision.

---

## Resume point — session of 2026-10-14 (SUPERSEDED by the 2026-10-17 section above; kept for history)

(`finder-glm-5-3`, after Phase 3 and its acceptance)

**Change `finder-glm-5-3`** (status `implementing`, branch `feat/finder-glm-5-3`, draft PR #292). Plan: 7 phases,
**3 implemented**. **$0.00 spent**; nothing paid has run (the paid series is Phase 5), and AI review is still off
on `master`.

- **Local `HEAD` = `origin` = `895f92e`** (pushed 2026-10-14; 2.7 re-confirmed at `f2ccfdd`, recorded in
  `895f92e`). Nothing is unpushed. PR CI on `f2ccfdd` green (run 38625690941: `ci`, `code-reviewer`, `integration`,
  `e2e`); CI on `895f92e` green too (run 38626497400; bookkeeping only, no code).
- **Phase 3** (measurement tooling): `965ae3d`, `1b8622c`; review NEEDS ATTENTION, fixes F1–F5 in `674fb79`
  (`reviews/impl-review-phase-3-1b8622c.md`). After that, owner decisions on 2026-10-14:
  - `8cf9194`: a confirmed OpenRouter 401/402 (the CLI's `api error: status=<n>` line) stops the series
    INCOMPLETE (auth/credit). Text without the typed status is only "suspected".
  - `20a3127`: on a provider error, the step summary shows only `<error name>: api error: status=<n>`. The
    provider's message (response body text) stays on the stderr message line. A stubbed 402 run through the real
    CLI found the body text in the summary.
  - `d04c66f`: the CLI step line prints `kind=step|finalization|repair`, and the runner records it for a run
    without `review.json`. `58be5e4` records the decision, the 2.7 reopen and its re-confirmation.
  - `eb5ea06`: any other SDK error in the chain (no HTTP status) shows only
    `<error name>: SDK error (message only in the job log)` in the step summary — `TypeValidationError` /
    `JSONParseError` quote model output.
  - `f2ccfdd` (finding 3): the same rule now covers the PR comment. A failed implementation review shows in
    `comment.md` only `publicError` (from `publicErrorSummary` in `retry.ts`, now shared with the step summary);
    `error` keeps the full message for the stderr `impl review: FAILED` line and `review.json`. Before the fix, a
    stubbed 402 on the impl-review request put the provider body into `comment.md`. Landed before the Phase 4
    seal, which covers every `packages/code-reviewer/src/**/*.ts`.
- **Reviews:** Phase 1 APPROVED; Phase 2 NEEDS ATTENTION (fixes `b6afeb1`); Phase 3 NEEDS ATTENTION (fixes
  `674fb79`). `8cf9194`, `20a3127`, `d04c66f`, `eb5ea06` and `f2ccfdd` have had no phase review.
- **Manual acceptance (all current):**
  - 1.8 accepted at `4432a70`;
  - 2.7 accepted at `f2ccfdd` (reopened by its `cli.ts` change; re-checked through the real CLI against `eb5ea06`,
    five stubbed cases, stderr / step summary / stdout byte-identical; evidence in plan.md Progress);
  - 3.5 accepted at `674fb79`.
  - The manual checks of Phases 4–7 are pending.

**Uncommitted:** only this file.

**Next actions, in order:**

1. **Done 2026-10-14:** `kind=` on the CLI step line (`d04c66f`), SDK error text out of the step summary
   (`eb5ea06`), 2.7 re-confirmed and recorded (`58be5e4`, `cc59ccd`).
2. **Done 2026-10-14 (`f2ccfdd`): finding 3 fixed before the seal.** Test-first: 4 MODEL-SENTINEL cases in
   `pipeline.test.ts`, 1 in `render.test.ts` and a stubbed 402 end to end in `cli.test.ts` failed, then passed.
   Deliberate breaks turned them red again. Vitest 1046/1046, tsc, eslint, prettier clean, REASONING-SENTINEL 7/7.
   PR CI green (run 38625690941).
3. **Done 2026-10-14 (`895f92e`):** 2.7 re-confirmed at `f2ccfdd` after the reopen; pushed.
4. **Done 2026-10-14:** CI on `895f92e` green (run 38626497400: `ci`, `code-reviewer`, `integration`, `e2e`).
5. **Agent:** `/rune-implement finder-glm-5-3 phase 4` (pre-registration and seal). It is still free; Phase 5 is
   the first paid one. From the seal on, no `packages/code-reviewer/src/**/*.ts` may change until G5 is done.

Still observed, not acted on: the SDK may print `[openrouter] Some reasoning_details entries were removed because
they were missing signatures…` to stderr. It carries no model text; whether real glm-5.3 responses trigger it is
unknown.

---

## Resume point — session of 2026-10-11 (SUPERSEDED by the 2026-10-14 section above; kept for history)

**Change `finder-glm-5-3`** (`context/changes/finder-glm-5-3/`, status `implementing`, branch
`feat/finder-glm-5-3`, draft PR #292). Plan: 7 phases. **$0.00 spent**; nothing paid has run, and AI review is
still off on `master`.

- **Phase 1** (port of the two-stage finder and its routing): `9782f38`, pushed, PR CI green, phase review
  APPROVED (`reviews/impl-review-phase-1-9782f38.md`, now committed).
- **Phase 2** (configure for glm-5.3 and close the gaps): **`64fad61`, pushed to `origin` 2026-10-11** (PR #292
  CI runs on it). All automated rows 2.1–2.6 pass: vitest 747/747, tsc and eslint 0, the
  `REASONING-SENTINEL` tests 6/6, no `enabled: false` left, root prettier clean, and the 12 stale-pointer grep hits
  are all deliberately kept (listed in the commit body). Two negative controls (redaction removed, reasoning
  leaked into the transcript) turned the sentinel tests red; both files were restored.
  - What it does: finder default `z-ai/glm-5.3`, `reasoning: {enabled: true, effort: "low"}` on every finder
    request and on no judge or impl-review request, routing `z-ai,fireworks,together`; `finish=length` and inline
    `<think` fail the attempt at every request kind without a retry; `review.json` `finderTelemetry.requests` per
    request (kind, attempt, provider, model, finish, reasoning tokens, cost — only provider-reported values,
    otherwise `missing`); a `finder configuration:` stderr line; the CLI never prints a text containing `<think`.

**Uncommitted:** only `context/changes/finder-glm-5-3/plan.md` (the Phase 2 Progress SHA write-back
`— 64fad61`). It is the workflow's carried edit and rides with the next commit; nothing else is dirty.

**Next actions, in order:**

1. **Owner:** in a fresh session, run `/rune-impl-review @context/changes/finder-glm-5-3/plan.md phase 2` (the
   owner chose "review this phase first"). It reviews `64fad61`.
2. **Owner:** confirm Manual **2.7** (the `finder configuration:` and step lines show model, provider and
   reasoning volume without model text) or leave it pending. Manual **1.8** (`screening-config.md` sufficient and
   non-sensitive) is also still pending.
3. **Owner, decide before the Phase 4 seal:** add `kind=` to the CLI step line? Today the finalization prints as
   `finder step N`, so Phase 3's runner can tell it apart from loop steps only by position when a failed run
   leaves no `review.json`. Free now, frozen after the seal.
4. **Owner:** check that PR #292's CI (`ci`, `integration`, `e2e`, `code-reviewer`) is green on `64fad61`.
5. **Agent:** `/rune-implement finder-glm-5-3 phase 3` — runner, G3 row checker, hand-read sheet, cost
   projection; still all free and hermetic.

Observed, not acted on: the SDK itself may print `[openrouter] Some reasoning_details entries were removed
because they were missing signatures…` to stderr. It carries no model text; whether real glm-5.3 responses
trigger it is unknown.

---

## Resume point — session of 2026-10-05 (SUPERSEDED by the 2026-10-11 section above; kept for history)

**`finder-verification` is archived** at `context/archive/2026-10-03-finder-verification/` (outcome
`completed`; archive commit `6a99445`, sync record `39e7859`, pushed 2026-10-05T18:40:57Z). Its result is
**decision 4.4 = none admitted**. The plan rows of Phases 5, 6 and 8 stay unchecked because they do not apply
on this path; the stamp says so.

**What happened (owner-authorized Phase 4, all in the archived `gate.md` § Results):**

- **Pre-flight clean:** the seal recomputes to `8616eda6…` and every prompt and code hash and input matches.
  The grader `google/gemini-3.1-pro-preview` reports `reasoning.mandatory: true`, which is "not previously
  measured", not "unchanged". The owner accepted it, because A3 covers only the finder and the verifier.
- **CONTROL (luna verifies luna):**
  - **G2 PASS** — 5/5 attempts, published `[]`.
  - **G3f FAIL** — React `issue_recall` 0/3, `flaw_stale_closure` 0/3, `flaw_lost_cleanup` 2/3.
  - **G4 PASS.**
  - **Label `FAIL (G3f)`.** #269 and #240 were not measured.
- **Where the React flaws were lost:**
  - In rows 1 and 3, the finder never raised the stale closure, so it was lost **before** verification.
  - In row 2, the verifier returned `unsupported` for a compound finding (stale closure + cleanup) and withheld
    all of it.
  - The same luna passed 3/3 alone on 2026-10-03.
- **MAIN (sonnet-5 verifier): declined by the owner.** It cannot fix finder-side misses, and its pessimistic
  total ($2.25) does not fit $2.00. Label: `not measured (owner declined after CONTROL FAIL (G3f))`.
- **Spend:** **T = $0.059069935** of $2.00. The counter equals telemetry to the micro-dollar.
- **Production unchanged:** `ai-review` stays off on `master` (the `false &&` line from `68151b0` stays).
  Close-out: package tests 1086/1086, typecheck and lint green.
- **Follow-ups for a successor** (not yet a change):
  `context/archive/2026-10-03-finder-verification/follow-ups/successor.md`.
  - **F-a — finder recall variance:** luna missed the stale closure in 2 of 6 React rows over two days. A
    single 3-row "3/3" draw passes only ≈ 58% of the time at that miss rate, so the gate confounds the
    intervention with finder variance.
  - **F-b — compound findings:** one verdict per finding withheld a verifiable claim bundled with an
    unverifiable one.
- **What it did not show:** whether verification removes the false positives on real PRs (the reason the change
  existed: 19/20 rejected on #269 in `finder-model-swap`). It also did not show that "no model works": only
  cheap finders were tried, under G4's $0.003 per row.

**Branches and tags on `origin` (owner: keep all, merge none):**

- `feat/finder-verification` = **`39e7859`**, the checked-out branch, identical to `origin`. It carries the
  verifier pass, the excerpt planner and the gate tooling (reusable by a successor).
- `feat/finder-model-swap` = `573ee33`; `feat/finder-serialization-outage` = `87ba5da`.
- Tags `finder-verification/freeze` → `c3b2f1c` and `finder-verification/seal` → `9c85aa2`.
- `master` = `e2fe655`, 3 commits ahead of the branch's base (settings, this file, `68151b0`). A merge into the
  branch would be clean but is unnecessary. It is blocked only by the two uncommitted files below.

**Worktrees:** only the main one (`git worktree list` shows a single entry). The helper worktrees of the
measurement were removed; the inputs can be rebuilt from the archived `gate.md` § Inputs freeze recipes.

**Next actions, in order:**

1. **Owner:** pick the next direction:
   - **(a)** fix the gate first (F-a: more draws per required metric, a pre-registered rate rule), then a fresh
     measurement on the unseen reserve #247;
   - **(b)** measure a stronger finder (e.g. `anthropic/claude-sonnet-5`), which needs G4's cost ceiling
     raised;
   - **(c)** stay without AI review on purpose (it was advisory);
   - **(d)** switch to the `cloud-exif-orientation` track (Steps 1 below).
2. **Agent, after 1:** `/rune-new` for the successor (bringing F-a/F-b), or commit the
   `cloud-exif-orientation` folder and `/rune-plan` it.
3. **Owner, when convenient:** commit `.claude/settings.local.json` and this file (a PR of their own, as #274),
   or leave them local.

**Uncommitted, the owner's, untouched by the agent:** `.claude/settings.local.json`, this file and
`context/changes/cloud-exif-orientation/` (untracked).

---

## Resume point — session of 2026-10-04 (SUPERSEDED by the 2026-10-05 section above; kept for history)

Nothing is lost by the shutdown: **every commit below is on `origin`**, the working tree holds no work of this
change, and `$0.00` has been spent. Only the agent session is gone.

**Branches and tags on `origin`:**

- `feat/finder-verification` = **`a2a2085`**, the checked-out branch, identical to `origin`. **Do not merge.**
- `master` = `e2fe655`. It carries `68151b0` (R11: `ai-review` switched off with `false &&` until a verified
  finder ships).
- Tags: `finder-verification/freeze` → `c3b2f1c` (Phase 0 freeze, pushed 11:25:02Z) and
  **`finder-verification/seal` → `9c85aa2`** (tag object `85aa508`). Both are checked with `git ls-remote --tags`.

**`finder-verification`: Phases 0–3 done; the Pre-registration is SEALED.**

- **Seal:** the sha256 of `## Pre-registration` … `_End of Pre-registration._` in `gate.md` is
  **`8616eda6a217c8570a2f3cba957fc2a3dfcfd5b7223c2d3b3426f08baff0c375`**.
  - Taken 2026-10-04T20:59:17Z. Seal commit `9c85aa2`; GitHub push time **2026-10-04T20:59:42Z**.
  - Verified independently by the ai-toolkit session at `58fd4ec`, `9c85aa2` and `807f9ae`. **Never recompute
    it.**
  - The owner confirmed the six plan-chosen terms and approved the section on 2026-10-04. Progress 0.1–3.6 is
    ticked.
- **Today's commits, in order:**
  - `0f2d3a9` — the phase 2 owner decisions.
  - `5b29930` — fixes for phase-2 review F1–F9.
  - `af6ae9c` — the F4/F7 confirmations.
  - `3f89d38` — Phase 3 pre-seal work: backcheck 9/20 rows fully served, unit-span 19 files / 56 units / 0
    mismatches, hashes, budget.
  - `a8844a6` — two owner decisions:
    - `EXCERPT_LIMITS` stay; 9/20 is accepted knowingly, and D2 is only partly served, so G3h on #269 may see
      N = 0.
    - #240's K list is empty, which makes R4 `NOT PROVEN`, information only.
  - `58fd4ec` — fixes for impl-review a8844a6 F1–F8 (report `reviews/impl-review-a8844a6.md`, all FIXED):
    - 401/402 on fixture rows is a measurement error.
    - Only HTTP-status, timeout and output-validation errors are the model's; everything else is a measurement
      error and stops the series. The owner confirmed that a status-less connection failure is a measurement
      error.
    - The series identity carries the sealed code hashes and the `src/` tree.
    - recall-guard's empty list prints its own line and exits 3.
    - The unit-span check is anchored and asserts 19 / 56.
    - `committedTreeOf` is tested.
    - Package tests: 1086.
  - `9c85aa2` — the seal.
  - `807f9ae` — the push time.
  - `a2a2085` — the seal tag record.
- **Budget:** $2.00 total; stop and ask at $1.60. **Spent $0.00.** In `gate.md` §7, the pessimistic table is
  CONTROL $1.08 and MAIN $2.25; `A_max` is CONTROL $0.10 and MAIN $0.17. If CONTROL spends its estimate, MAIN's
  second PR series crosses $1.60.

**Next actions, in order:**

1. **Owner:** decide whether Phase 4 (CONTROL, **paid**) may start. Nothing paid runs before that.
2. **Agent, after the go:** the Phase 4 §1 pre-flight (plan.md; `gate.md` §5/§7):
   - `origin` carries the seal, and the section still hashes to `8616eda6…`;
   - `npx tsx scripts/verifier-prompt-hash.mjs` (from `packages/code-reviewer`) matches `gate.md` §1;
   - the inputs re-verify;
   - re-read the prices, `supported_parameters` and `reasoning.mandatory` for luna @ `openai`, sonnet-5 @
     `anthropic` and the grader. Any change → stop and ask;
   - T0 from `GET /api/v1/key`.
3. **Agent:** the series in the sealed order, checking T + P ≤ $1.60 before each one:
   1. G2-01 alone (`--through 1`), then G2-02..05.
   2. promptfoo `control-luna-verify`, then the rows script with `--expected-verifier-provider`.
   3. #269 × 10, then #240 × 10, with `--stages finder,verifier,judge`.

   `--max-spend` is required and caps the whole series. A measurement error stops the series for the owner.

4. **Then Phase 5:** R4 (the K list is empty, so `NOT PROVEN`, information only), the per-PR hand-reads (G3h),
   and CONTROL's verdict. MAIN runs only after a CONTROL **quality-gate** failure (G2, G3f, R4 FAIL, G3h), and
   only with the owner's budget decision.

**Housekeeping (harmless; left as is):**

- `.git/rune/finder-verification.carry` lists `change.md`, `plan.md` and the a8844a6 report. All three are now
  committed, so the entries are stale.
- `.git/rune/` also holds old `*.status` / `*.carry` files from other changes.

**Uncommitted, the owner's, untouched:** `.claude/settings.local.json`, this file and
`context/changes/cloud-exif-orientation/` (untracked).

---

## Resume point — session of 2026-10-03 (SUPERSEDED by the 2026-10-04 section above; kept for history)

Nothing below is lost by a restart: every file named here is on disk, the carry records live in `.git/rune/`,
and every commit named here is on `origin`. Only the running agent session is gone.

**Branches on `origin` (do not merge any of them; the owner said so on 2026-10-03):**

- `master` = `6e2bd08` — #274 merged (rebase): `.claude/settings.local.json` allow-list entries and this
  file's 2026-09-29 notes. `vars.OPENROUTER_REVIEW_MODEL` on master is still `z-ai/glm-4.6`.
- `feat/finder-serialization-outage` = `87ba5da` — archived change, kept as code base (two-stage finder).
- `feat/finder-model-swap` = `573ee33` — archived change (`context/archive/2026-10-02-finder-model-swap/`,
  commits `6a3639b` close + `573ee33` record sync). Its code routes the finder to `["novita"]`
  (`packages/code-reviewer/src/config.ts:130`), so merging it would deploy Novita, which failed G3 — hence no PR.
- `feat/finder-verification` = `573ee33` (same commit; branch created from the archived HEAD). **This is the
  checked-out branch.** It carries the new change, uncommitted.

**Result of `finder-model-swap` (owner decision 4.4, 2026-10-03):** luna `FAIL (G3 hand-read)` (automated
G1–G4 passed, 19 of 20 distinct #269 findings rejected against a limit of 1; D13 and D20 checked by the owner
in the code), qwen `FAIL (G3)`, minimax `FAIL (G2)`; spent $0.2111 of $2.00; **no finder until a separate
owner decision; threshold unchanged; Phase 4 not executed.** Record: the archived `gate.md` (§ Hand-read,
§ Decision 4.4) and `change.md` (§ Close-out). Seals re-verified at archive time: Pre-registration
`f6dc0fb0…e34e`, A1 `dc423199…bb9c`.

**`finder-verification` (owner: path C), status `preparing`, everything uncommitted, in carry
(`.git/rune/finder-verification.carry` — re-verified at 23:45: all four blob hashes match the files on disk):**

- `context/changes/finder-verification/change.md` — where it comes from, the observation (luna 10/10,
  $0.0048 and 13 s per #269 attempt, 19/20 rejected, five contradicted by the code), the hypothesis (verify
  each finding by a code quotation before publication; unconfirmed findings drop), constraints (G3 threshold
  unchanged, a new separately registered gate, an unseen case), and the dated section **"Owner decision
  (2026-10-03): verifier design and budget"**: main arm = the judge (`anthropic/claude-sonnet-5`) verifies
  with code excerpts before grading; control arm = luna verifies its own findings in a separate call, judge
  unchanged; option 4 (sol) in reserve, not measured; **$2.00 total, stop at $1.60**; G3 on PUBLISHED findings;
  open before the seal: (a) a new cost criterion in place of G4, (b) reasoning for the verifier, (c) ai-review
  on master until the result.
- `context/changes/finder-verification/research.md` — `/rune-research` done 2026-10-03 (no model calls),
  nine sections + 11 owner decisions. Key results: the judge is blind by contract (`prompts.ts:116`) and
  render/labels/exit code do not depend on the finding count, so a **separate verification call** (design b)
  is the smaller change and serves both arms; excerpts must come from the **source root via the existing
  diff-scoped provider** (CI always passes `--source-root`), not from diff text; a cited `file:line` alone
  gives the verifier the right code for **1 of 38** findings (±25 lines: 16; enclosing function: 9), and the
  deciding lines are often in the caller (D13, D2, D20), the module docstring (D9, D10, D12, D14), another
  file (D3, D11, D18, D19) or Pillow (D1, D15, D17); cost: main arm $0.030–0.065 per #269 attempt (6–14× the
  finder), control arm +$0.0005–0.0023 and +3–8 s; proposed cost criterion: keep G4 for the finder on fixtures
  - **G4b: median total review cost per PR-sized attempt ≤ $0.063 = 3 × $0.021087** (the one measured
    production finder+judge review, PR #132); a **recall floor on published findings** is needed beside G3;
    "unverifiable" is assigned by code, never chosen by the model, and is not published but recorded; unseen
    case: **PR #240** (18.7 KB, `src/` React/TS + tests, no finder output exists for it), backup #247; **Jev
    (typesafe.ai)** checked at the owner's request: real, $0.042/M input, returns probabilities not quotes,
    not on OpenRouter's chat path — option 4b in reserve.
- `context/changes/finder-verification/backcheck-269.py` + `backcheck-269-results.json` — the backward check
  behind research §7, re-runnable: `python3 context/changes/finder-verification/backcheck-269.py`.
- **Not run on purpose:** `/rune-frame`, `/rune-plan`. The owner decides the 11 open points in research.md
  § Open Questions first (design a/b, cost criterion and its baseline, recall guard, "unverifiable" rule,
  excerpt policy scale, no-source rule, unseen case + holdout rules, verifier reasoning, ai-review on master,
  Jev, whether to measure today's judge on #269 ×10 for ≈ $0.20 before sealing G4b).

**Other uncommitted things in the working tree (all the owner's, untouched by the agent):**

- `.claude/settings.local.json` — three allow-list entries added after #274 (`git worktree *` and two one-offs).
- `context/changes/cloud-exif-orientation/` — still untracked (see step 1 below).
- `.git/rune/finder-model-swap-phase-3.status` — a stale snapshot from an earlier session; harmless.

**Checked at 23:45 before the restart:** `origin/master` = `6e2bd08`; `origin/feat/finder-verification`,
`origin/feat/finder-model-swap`, `origin/feat/finder-serialization-outage` all exist. `gh pr list` hung on the
network this time, so "zero open PRs" below is from the earlier session, not re-checked.

**The 11 decisions, condensed (full reasoning: `research.md` § Open Questions and the sections it cites).
The owner can answer "research recommendations" plus separate answers for 3, 8, 9, 10, 11:**

1. **Design (a) or (b)** — one combined judge call, or a separate verification call. **Research leans (b)**:
   smaller change, serves both arms with a model id.
2. **Cost criterion** — keep G4 for the finder on fixtures **and add G4b**: median total review cost per
   PR-sized attempt ≤ $0.063 (= 3 × $0.021087, PR #132). Open: baseline from #132 or a fresh #269 judge
   measurement (see 11); which finding count and excerpt size the number assumes.
3. **Recall guard** — fixture metrics computed on PUBLISHED findings (cheap for CONTROL, ≈ $0.25 per gate
   plus tooling for MAIN), or accept recall-after-verification measured only by the hand-read. **No recommendation.**
4. **"Unverifiable"** — **recommended: not published, recorded.** Also decide `category: testing` claims
   (file-list check vs drop) and library-semantics claims.
5. **Excerpt policy scale** — a cited `file:line` alone sufficed for **1 of 38** findings (±25 lines: 16;
   enclosing function: 9). ±15 lines is the floor; §7 needs header + identifier-snapped function + one-hop
   caller + cross-file identifiers, with per-finding and per-review caps.
6. **No-source rule** — **recommended: pass-through**, and `offDiffFindingPaths` on the pre-verification set.
7. **Unseen case** — **recommended: PR #240** (18.7 KB, `src/` React/TS + tests, no finder output exists),
   backup #247; holdout/freeze rules of research §5 (sha256 before the verifier prompt exists).
8. **Reasoning for the verifier** — A3 applied to the finder; output tokens are priced on sonnet/luna and free
   on Jev. **Decide per arm.**
9. **ai-review on master** until the result — off or on. **Owner only.**
10. **Jev (typesafe.ai)** — reserve as option 4b (probability threshold, second provider) or out. **Owner only.**
11. **Judge latency on #269 is unmeasured** — spend ≈ $0.20 on today's judge ×10 on #269 before sealing the
    G4b baseline, or use #132. **Owner only** (it is paid).

**Next actions, in order:**

1. **Owner:** answer the 11 points above.
2. **Owner:** commit the carry (four files) now, or leave it for the first phase commit. The agent commits on
   request, staging only those four paths (never `.claude/settings.local.json` or this file).
3. **Agent (blocked by 1):** `/rune-plan finder-verification` (optionally `/rune-frame` first). The gate is
   registered before any paid call: G3 on published findings, G4 + G4b, the recall floor, #240 frozen by sha256
   before the verifier prompt exists, prompt sha256 inside the seal. Budget $2.00, stop at $1.60; **$0.00 spent
   so far** in this change.
4. **Owner, separately:** the finder decision itself (sol, another candidate, Jev as 4b, or stay without a
   finder); the fate of `feat/finder-serialization-outage` and `feat/finder-model-swap` on `origin`.
5. **Alternative track:** `cloud-exif-orientation` is a small user-facing bug independent of the finder — the
   agent commits its folder and runs `/rune-plan cloud-exif-orientation` (step 1 under "Steps" below).

## Where things stand

Everything is merged. **Zero open PRs** after the one carrying this file. Only `master` exists,
locally and on `origin`: all merged branches were deleted on 2026-09-28, and one worktree was removed.

**Test-corpus provenance restored** (#273). The census section `§ Provenance of the test corpus`
had been left on an unmerged branch. It is now in
`context/archive/2026-08-31-cloud-quality-below-local/result-dimensions-census.md` as a documented
exception to archive immutability, and AGENTS.md links to it.

**S-17 is closed** (2026-09-28, #269, issue #203 closed; archive commit `00088d3` on master). It is
archived at `context/archive/2026-08-31-cloud-quality-below-local/`.

- The Bread calibration series ended. Within the range tested, it gave no basis for a reliable
  Cloud Auto rule. Tested: gamma 0.5–1.5 at strength 0.05, and gamma 0.5 at strength 0.0 on two
  photos.
- Bread gained on 4 of 6 tuning photos, two of them only slightly. S17-02 is harmed at every
  setting.
- **Decision B:** a model comparison instead of calibration.
- Phases 4–6 of the S-17 plan were not carried out.

**S-19 `cloud-model-comparison`** is registered (#270, issue #271, status `proposed`). It chooses
the basic Cloud path's model by a holdout comparison on `s17-v1`. Bread at low gamma and weak
denoise is one candidate. The S-18 delivery half and `local-engine-ceiling` (#188) are parked on its
result.

**`cloud-exif-orientation`** is a separate change: Bread returns EXIF-6/8 phone photos rotated 90°.
It is likely live in production (the upload sends the original bytes), though not yet observed in
the app. Its folder is still untracked. It is a precondition for S-19's in-app runs.

Tools (still valid for S-19):

- `s17-v1` benchmark: 18 inputs in `test-photos/licensed/`, **6 tuning / 12 validation**. Manifest
  `test-photos/s17-benchmark.json`, hashes `test-photos/s17-benchmark.sha256` (verify before runs).
  **The 12 validation photos have never been opened by any model run — keep it that way until the
  comparison.**
- Quality bar and all Bread evidence: `context/archive/2026-08-31-cloud-quality-below-local/`
  (`quality-bar.md`, `calibration.md`).
- `scripts/spikes/bread-spike.ts`: Bread directly on a local file, with no daily cap and the raw
  output saved with its sha256. Needs your own `REPLICATE_API_TOKEN`; keep it local.
- `scripts/s17/contact-sheet.py`: works on tuning photos only and refuses validation ids. It needs
  numpy and Pillow, which the system `python3` lacks, so use a venv.
- `scripts/measure-hue-shares.py`, `scripts/prod-fetch-results.py`,
  `scripts/prod-result-dimensions.py`: diagnostics. Production credentials stay with the
  maintainer.
- **Replicate credit is below $5**, so creates are throttled to 6 a minute. Top it up before
  larger runs.
- **Daily cap:** the plan to raise `CLOUD_DAILY_CAP` to 10 for validation days went away with S-17
  Phases 4–6. Any raise for S-19 is decided in its plan. The cap is currently 3.

## Steps

1. **Fix `cloud-exif-orientation`** (recommended first). It is a user-facing bug, small, and
   independent of the model choice.
   - Maintainer: approve a branch.
   - Agent: commit the folder, then `/rune-plan cloud-exif-orientation`.

2. **Research S-19:** `/10x-research cloud-model-comparison`. It makes no Replicate runs. It covers
   the candidate models for the basic Cloud path (cost, cold start, contract), a comparison protocol
   that keeps the holdout closed, and whether Local is compared too. It can run in parallel with
   step 1. In-app comparison runs wait for step 1 in production.

3. **Review `references/01`–`07`.** They are now under
   `context/archive/2026-08-31-cloud-quality-below-local/references/`. AGENTS.md § Evidence images
   names them as derivatives of `ALL RIGHTS RESERVED` material awaiting a separate review; the rule
   does not approve them retroactively. Decide: keep, remove, or assess a specific basis. The folder
   is archived, so removal would need a deliberate exception to archive immutability.

4. **Decide on the three waiting changes.**
   - **`developer-feedback`** needs one maintainer decision: _can anonymous visitors submit
     feedback, or only signed-in users?_ After that it can be planned. Its constraints are in its
     `change.md`. It is not on the roadmap.
   - **`cloud-error-message-leak`** has its framing written and can go straight to `/rune-plan`.
   - **`finder-serialization-outage`** and **`finder-model-swap`** — both **archived** (2026-10-02 and
     2026-10-03; `context/archive/2026-09-24-finder-serialization-outage/`,
     `context/archive/2026-10-02-finder-model-swap/`). Outcome: the outage's cause is fixed in code on the
     branches, no finder model passed the gate, production still points at `z-ai/glm-4.6`. Successor
     **`finder-verification`** — also **archived** (2026-10-05,
     `context/archive/2026-10-03-finder-verification/`): none admitted; follow-ups F-a/F-b wait for an
     owner decision (see the resume point at the top of this file).

5. **`.claude/settings.local.json`** — committed through #274 on 2026-10-03; it keeps collecting entries, so
   repeat that periodically (a PR of its own, as #274) or leave the rest local.
